import { Module } from '@nestjs/common';
import { RemembersService } from './remembers.service';
import { RemembersController } from './remembers.controller';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [RemembersController],
  providers: [RemembersService],
})
export class RemembersModule {}
