import multer from "multer"

const storage = multer.memoryStorage()

export const uploadImage = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"]

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("File harus JPG, PNG, atau WEBP"))
    }

    cb(null, true)
  },
})