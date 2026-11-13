export const MAX_UPLOAD_SIZE_MB = 3 as const;
export const MAX_UPLOAD_SIZE_BYTES = 1024 * 1024 * MAX_UPLOAD_SIZE_MB;

export const MAX_IMAGE_INPUT_PIXELS = 50_000_000;
export const MAX_IMAGE_OUTPUT_DIMENSION = 4096;

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'] as const;
