import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import 'dotenv/config';

import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.enableCors({ origin: 'http://localhost:3001', credentials: true });

  app.setGlobalPrefix('api');

  app.enableShutdownHooks();
  await app.listen(3000);
}
bootstrap();
