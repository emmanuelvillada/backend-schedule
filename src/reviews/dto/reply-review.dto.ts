import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ReplyReviewDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reply: string;
}
