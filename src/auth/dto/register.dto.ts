import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Role, BusinessCategory } from '@prisma/client';

class RegisterBusinessDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  description: string;

  @IsEnum(BusinessCategory)
  category: BusinessCategory;
}

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsString()
  name: string;

  @IsEnum(Role)
  role: Role;

  // Solo se usa (y se exige) cuando role === BUSINESS_OWNER, para crear el
  // negocio en el mismo paso del registro.
  @IsOptional()
  @ValidateNested()
  @Type(() => RegisterBusinessDto)
  business?: RegisterBusinessDto;
}
