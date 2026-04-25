/**
 * Рисует изображение на белом фоне и возвращает новый File без прозрачности.
 * Устраняет серо-белую «шашку» у PNG с прозрачным фоном.
 */
export function fillTransparentWithWhite(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(url)
      const w = img.naturalWidth
      const h = img.naturalHeight
      if (!w || !h) {
        reject(new Error('Invalid image dimensions'))
        return
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas 2d not available'))
        return
      }
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to export image'))
            return
          }
          const name = file.name.replace(/\.[^.]+$/i, '') + '.png'
          resolve(new File([blob], name, { type: 'image/png' }))
        },
        'image/png',
        0.92
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }

    img.src = url
  })
}
