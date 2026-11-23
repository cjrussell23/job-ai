import { readFontFile } from "@/features/documents/pdf";

/** The bundled resume fonts, for the live preview. Open-licence files, served to anyone. */
export async function GET(_: Request, { params }: RouteContext<"/resume-fonts/[file]">) {
  const { file } = await params;
  const data = await readFontFile(file);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "font/woff2",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
