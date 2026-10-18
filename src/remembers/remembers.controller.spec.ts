import { Test, TestingModule } from '@nestjs/testing';
import { RemembersController } from './remembers.controller';
import { RemembersService } from './remembers.service';

describe('RemembersController', () => {
  let controller: RemembersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RemembersController],
      providers: [RemembersService],
    }).compile();

    controller = module.get<RemembersController>(RemembersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
