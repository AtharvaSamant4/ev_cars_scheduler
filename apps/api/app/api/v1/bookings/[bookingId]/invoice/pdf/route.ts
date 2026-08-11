import { NextResponse } from "next/server";

import { requireInvoiceDownloadAuth } from "@/src/lib/auth";
import { apiRoute, routeId } from "@/src/lib/http";
import { generateInvoicePdf } from "@/src/modules/invoices/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiRoute(async (request, context) => {
  const bookingId = await routeId(context, "bookingId");
  const user = await requireInvoiceDownloadAuth(request, bookingId);
  const pdfBuffer = await generateInvoicePdf(
    bookingId,
    user.societyId,
    user.id,
    user.role,
  );

  return new NextResponse(Uint8Array.from(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${bookingId}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
