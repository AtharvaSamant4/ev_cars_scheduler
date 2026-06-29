import PDFDocument from "pdfkit";
import { prisma } from "@society-ev/db";
import { AppError } from "@/src/lib/errors";

export async function generateInvoicePdf(bookingId: string, societyId: string, userId: string, role: string): Promise<Buffer> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId, societyId },
    include: {
      invoice: true,
      flat: { include: { resident: true } },
      user: true,
      vehicle: true,
      society: true,
    }
  });

  if (!booking || !booking.invoice) {
    throw new AppError(404, "NOT_FOUND", "Invoice not found for this booking");
  }

  if (role === "RESIDENT" && booking.userId !== userId) {
    throw new AppError(403, "FORBIDDEN", "You don't have access to this invoice");
  }

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 0, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      const primaryColor = '#111827';
      const secondaryColor = '#4B5563';
      const accentColor = '#10B981'; // Green for paid
      const lightBg = '#F3F4F6';

      // 1. Header Strip
      doc.rect(0, 0, 595, 120).fill(primaryColor);
      
      // Society Name
      doc.fillColor('#FFFFFF')
         .fontSize(22)
         .font('Helvetica-Bold')
         .text(booking.society.name.toUpperCase(), 50, 45, { width: 350 });

      // System Label under Society Name
      doc.fillColor('#9CA3AF')
         .fontSize(10)
         .font('Helvetica')
         .text('EV BOOKING RECEIPT', 50, 75);

      // INVOICE text
      doc.fillColor(accentColor)
         .fontSize(28)
         .font('Helvetica-Bold')
         .text('INVOICE', 0, 42, { align: 'right', width: 545 });
         
      // Subtitle
      doc.fillColor('#9CA3AF')
         .fontSize(10)
         .font('Helvetica')
         .text(`ID: ${booking.id.split('-')[0].toUpperCase()}`, 0, 75, { align: 'right', width: 545 });

      // Reset fill color for the rest of the document
      doc.fillColor(primaryColor);

      // 2. Info Section (Billed To & Details)
      doc.rect(50, 150, 230, 110).fill(lightBg);
      doc.rect(315, 150, 230, 110).fill(lightBg);

      // Billed To
      doc.fillColor(primaryColor).fontSize(12).font('Helvetica-Bold').text('BILLED TO', 65, 165);
      doc.fillColor(secondaryColor).fontSize(10).font('Helvetica')
         .text(booking.user.name, 65, 185)
         .text(`Flat ${booking.flat.number}`, 65, 200)
         .text(booking.user.phoneNumber || '', 65, 215);

      // Vehicle Info
      doc.fillColor(primaryColor).fontSize(12).font('Helvetica-Bold').text('VEHICLE DETAILS', 330, 165);
      doc.fillColor(secondaryColor).fontSize(10).font('Helvetica')
         .text(`Vehicle: ${booking.vehicle.name}`, 330, 185)
         .text(`Reg No: ${booking.vehicle.registrationNumber}`, 330, 200)
         .text(`Date: ${booking.invoice.generatedAt.toLocaleDateString()}`, 330, 215);

      // 3. Trip Timing Section
      doc.moveDown(4);
      let currentY = 290;
      doc.fillColor(primaryColor).fontSize(16).font('Helvetica-Bold').text('Trip Overview', 50, currentY);
      
      currentY += 25;
      doc.rect(50, currentY, 495, 1).fill('#D1D5DB'); // Divider
      
      currentY += 15;
      doc.fillColor(secondaryColor).fontSize(9).font('Helvetica-Bold');
      doc.text('SCHEDULED START', 50, currentY);
      doc.text('SCHEDULED END', 155, currentY);
      doc.text('ACTUAL START', 260, currentY);
      doc.text('ACTUAL END', 365, currentY);
      doc.text('DURATION', 480, currentY);

      currentY += 15;
      doc.fillColor(primaryColor).fontSize(9).font('Helvetica');
      doc.text(booking.startTime.toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }), 50, currentY);
      doc.text(booking.endTime.toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }), 155, currentY);
      doc.text(booking.actualRideStartTime ? booking.actualRideStartTime.toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }) : '-', 260, currentY);
      doc.text(booking.actualEndTime ? booking.actualEndTime.toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }) : '-', 365, currentY);
      
      const durationHours = (booking.durationMinutes / 60).toFixed(1);
      doc.text(`${durationHours} hrs`, 480, currentY);

      // 4. Invoice Breakdown Table
      currentY += 50;
      doc.fillColor(primaryColor).fontSize(16).font('Helvetica-Bold').text('Charges Breakdown', 50, currentY);
      
      currentY += 25;
      doc.rect(50, currentY, 495, 25).fill(lightBg);
      doc.fillColor(secondaryColor).fontSize(10).font('Helvetica-Bold');
      doc.text('DESCRIPTION', 60, currentY + 8);
      doc.text('AMOUNT', 0, currentY + 8, { align: 'right', width: 535 });

      currentY += 35;
      doc.fillColor(primaryColor).font('Helvetica');
      doc.text('Base Vehicle Charge', 60, currentY);
      doc.text(`Rs. ${booking.invoice.subtotal.toFixed(2)}`, 0, currentY, { align: 'right', width: 535 });

      currentY += 25;
      doc.rect(50, currentY - 10, 495, 1).fill('#F3F4F6');
      doc.fillColor(primaryColor);
      doc.text('Late Return Penalty', 60, currentY);
      doc.text(`Rs. ${booking.invoice.penaltyAmount.toFixed(2)}`, 0, currentY, { align: 'right', width: 535 });

      // Total Row
      currentY += 35;
      doc.rect(50, currentY, 495, 2).fill(primaryColor);
      
      currentY += 15;
      doc.fillColor(primaryColor).fontSize(14).font('Helvetica-Bold');
      doc.text('TOTAL DEDUCTED', 60, currentY);
      doc.fillColor(accentColor).fontSize(18);
      doc.text(`Rs. ${booking.invoice.totalAmount.toFixed(2)}`, 0, currentY - 2, { align: 'right', width: 535 });

      // PAID Stamp
      doc.save();
      doc.translate(450, 500);
      doc.rotate(-15);
      doc.fontSize(40).font('Helvetica-Bold').fillColor('#10B981').opacity(0.2).text('PAID', 0, 0);
      doc.restore();

      // Footer
      doc.fillColor(secondaryColor).fontSize(10).font('Helvetica-Oblique').opacity(1);
      doc.text('Thank you for choosing our EVs! This amount has been automatically deducted from your wallet.', 50, 750, { align: 'center', width: 495 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
