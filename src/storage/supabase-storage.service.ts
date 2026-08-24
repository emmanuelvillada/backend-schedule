import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const BUSINESS_PHOTOS_BUCKET = 'business-photos';

@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);
  private readonly client: SupabaseClient | null;

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('SUPABASE_URL');
    const key = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!url || !key) {
      this.logger.warn(
        'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configuradas: la subida de fotos no funcionará hasta que se configuren.',
      );
      this.client = null;
      return;
    }

    this.client = createClient(url, key);
  }

  async uploadBusinessPhoto(
    businessId: string,
    file: Express.Multer.File,
  ): Promise<{ url: string; path: string }> {
    const client = this.ensureClient();
    const extension = file.originalname.split('.').pop() ?? 'jpg';
    const path = `${businessId}/${randomUUID()}.${extension}`;

    const { error } = await client.storage
      .from(BUSINESS_PHOTOS_BUCKET)
      .upload(path, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      this.logger.error(
        `Error subiendo imagen a Supabase Storage: ${error.message}`,
      );
      throw new InternalServerErrorException('No se pudo subir la imagen');
    }

    const { data } = client.storage
      .from(BUSINESS_PHOTOS_BUCKET)
      .getPublicUrl(path);

    return { url: data.publicUrl, path };
  }

  async deleteBusinessPhoto(path: string): Promise<void> {
    const client = this.ensureClient();
    const { error } = await client.storage
      .from(BUSINESS_PHOTOS_BUCKET)
      .remove([path]);

    if (error) {
      // No bloqueamos el borrado del registro en BD por un fallo al borrar
      // el archivo en Storage; queda huérfano pero se puede limpiar aparte.
      this.logger.error(
        `Error borrando imagen de Supabase Storage: ${error.message}`,
      );
    }
  }

  private ensureClient(): SupabaseClient {
    if (!this.client) {
      throw new InternalServerErrorException(
        'El almacenamiento de imágenes no está configurado en el servidor',
      );
    }
    return this.client;
  }
}
