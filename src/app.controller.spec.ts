import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('healthCheck', () => {
    it('returns ok status with a timestamp', () => {
      const result = appController.healthCheck();
      expect(result.status).toBe('ok');
      expect(typeof result.timestamp).toBe('string');
    });
  });
});
