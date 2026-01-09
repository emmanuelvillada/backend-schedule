import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { BusinessCategory } from '@prisma/client';

export class CreateBusinessDto {
  @IsString()
  @IsNotEmpty()
  name: string;
  @IsString()
  description: string;
  @IsEnum(BusinessCategory)
  category: BusinessCategory;
  @IsString()
  ownerId: string;
}
