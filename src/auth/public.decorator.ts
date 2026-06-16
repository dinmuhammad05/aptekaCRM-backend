import { SetMetadata } from '@nestjs/common';

/** Endpointni autentifikatsiyadan ozod qiladi (masalan login) */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
