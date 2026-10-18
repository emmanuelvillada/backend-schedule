import { PartialType } from '@nestjs/swagger';
import { CreateRememberDto } from './create-remember.dto';

export class UpdateRememberDto extends PartialType(CreateRememberDto) {}
