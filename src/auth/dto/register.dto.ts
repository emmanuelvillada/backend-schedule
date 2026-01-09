import { IsEmail, IsEnum, IsString } from 'class-validator';
import { Role } from '@prisma/client';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsString()
  name: string;

  @IsEnum(Role)
  role: Role;
}
