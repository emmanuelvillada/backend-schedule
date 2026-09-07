import { IsBoolean } from 'class-validator';

export class UpdateActiveStatusDto {
  @IsBoolean()
  isActive: boolean;
}
