import { Test, TestingModule } from '@nestjs/testing';
import { BusinessService } from './business.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';

describe('BusinessService', () => {
  let service: BusinessService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessService,
        { provide: PrismaService, useValue: {} },
        { provide: SupabaseStorageService, useValue: {} },
      ],
    }).compile();

    service = module.get<BusinessService>(BusinessService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
