/** First image/file entry from ClipboardEvent.clipboardData (browser DataTransfer API). */
export function getFirstImageFromClipboard(
  cd: ClipboardEvent['clipboardData'] | null | undefined
): File | null {
  if (!cd?.items?.length) return null
  for (let i = 0; i < cd.items.length; i++) {
    const item = cd.items[i]
    if (item.kind !== 'file') continue
    const f = item.getAsFile()
    if (!f || !f.type.startsWith('image/')) continue
    return sanitizeClipboardImageFile(f)
  }
  return null
}

function sanitizeClipboardImageFile(f: File): File {
  const ext =
    f.type === 'image/png'
      ? 'png'
      : f.type === 'image/jpeg'
        ? 'jpg'
        : f.type === 'image/jpg'
          ? 'jpg'
          : f.type === 'image/webp'
            ? 'webp'
            : f.type === 'image/gif'
              ? 'gif'
              : 'png'

  try {
    return new File([f], `paste-${Date.now()}.${ext}`, { type: f.type })
  } catch {
    return f
  }
}
