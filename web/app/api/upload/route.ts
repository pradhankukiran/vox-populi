import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const filename =
    url.searchParams.get("filename") ?? `voxpop-${Date.now()}.wav`;

  if (!req.body) {
    return NextResponse.json({ error: "missing body" }, { status: 400 });
  }

  const blob = await put(filename, req.body, {
    access: "public",
    contentType: "audio/wav",
    addRandomSuffix: true,
  });

  return NextResponse.json({ url: blob.url, pathname: blob.pathname });
}
