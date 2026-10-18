import { Test, TestingModule } from '@nestjs/testing';
import { RemembersService } from './remembers.service';

describe('RemembersService', () => {
  let service: RemembersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RemembersService],
    }).compile();

    service = module.get<RemembersService>(RemembersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
