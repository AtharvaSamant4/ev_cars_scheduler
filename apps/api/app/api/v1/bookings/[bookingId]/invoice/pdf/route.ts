import { NextResponse } from "next/server";
import { requireAuth } from "@/src/lib/auth";
import { generateInvoicePdf } from "@/src/modules/invoices/service";

export const runtime = "nodejs";

export async function GET(request: Request, context: any) {
  try {
    const user = await requireAuth(request as any);
    const params = await context.params;
    const bookingId = params.bookingId || params.id;
    
    if (!bookingId) {
      return NextResponse.json({ error: "Booking ID is required" }, { status: 400 });
    }

    const pdfBuffer = await generateInvoicePdf(bookingId, user.societyId, user.id, user.role);

    const response = new NextResponse(pdfBuffer);
    response.headers.set('Content-Type', 'application/pdf');
    response.headers.set('Content-Disposition', `attachment; filename="invoice-${bookingId}.pdf"`);

    return response;
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status || 500 }
    );
  }
}
