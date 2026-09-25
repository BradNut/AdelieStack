export const MAX_UPLOAD_SIZE_MB = 3 as const;
export const MAX_UPLOAD_SIZE_BYTES = 1024 * 1024 * MAX_UPLOAD_SIZE_MB;

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'] as const;
