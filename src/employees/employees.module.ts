import { Module } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { MailModule } from 'src/mail/mail.module';
import { StorageModule } from 'src/storage/storage.module';

@Module({
  imports: [MailModule, StorageModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
