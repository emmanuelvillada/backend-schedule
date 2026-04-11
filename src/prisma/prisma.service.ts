import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    console.log('🔍 DATABASE_URL:', process.env.DATABASE_URL);
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      log: ['error'],
    });
    // Override SSL para el engine de Prisma
    (this as any)._engineConfig = {
      ...(this as any)._engineConfig,
      overrideDatasources: {
        db: {
          url: process.env.DATABASE_URL + '&sslmode=require',
        },
      },
    };
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
