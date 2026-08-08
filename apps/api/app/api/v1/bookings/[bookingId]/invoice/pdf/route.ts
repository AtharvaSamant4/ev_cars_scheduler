import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/src/lib/auth";
import { toAppError } from "@/src/lib/errors";
import { generateInvoicePdf } from "@/src/modules/invoices/service";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ bookingId: string }> },
) {
  try {
    const user = await requireAuth(request);
    const { bookingId } = await context.params;

    const pdfBuffer = await generateInvoicePdf(bookingId, user.societyId, user.id, user.role);

    return new NextResponse(Uint8Array.from(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="invoice-${bookingId}.pdf"`,
      },
    });
  } catch (error: unknown) {
    const appError = toAppError(error);
    return NextResponse.json(
      {
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details,
        },
      },
      { status: appError.status },
    );
  }
}
