import { Module } from '@nestjs/common';
import { RemembersService } from './remembers.service';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { MailModule } from 'src/mail/mail.module';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [NotificationsModule, MailModule, PrismaModule],
  providers: [RemembersService],
})
export class RemembersModule {}
