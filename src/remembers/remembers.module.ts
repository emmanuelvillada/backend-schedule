import { Module } from '@nestjs/common';
import { RemembersService } from './remembers.service';
import { RemembersController } from './remembers.controller';

@Module({
  controllers: [RemembersController],
  providers: [RemembersService],
})
export class RemembersModule {}
