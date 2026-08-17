import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { BusinessCategory } from '@prisma/client';

export class CreateBusinessDto {
  @IsString()
  @IsNotEmpty()
  name: string;
  @IsString()
  description: string;
  @IsEnum(BusinessCategory)
  category: BusinessCategory;

  // Solo un ADMIN puede asignar el negocio a otro owner distinto de sí mismo.
  @IsOptional()
  @IsString()
  ownerId?: string;
}
