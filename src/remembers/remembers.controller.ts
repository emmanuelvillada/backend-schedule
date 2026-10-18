import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { RemembersService } from './remembers.service';
import { CreateRememberDto } from './dto/create-remember.dto';
import { UpdateRememberDto } from './dto/update-remember.dto';

@Controller('remembers')
export class RemembersController {
  constructor(private readonly remembersService: RemembersService) {}

  @Post()
  create(@Body() createRememberDto: CreateRememberDto) {
    return this.remembersService.create(createRememberDto);
  }

  @Get()
  findAll() {
    return this.remembersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.remembersService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateRememberDto: UpdateRememberDto) {
    return this.remembersService.update(+id, updateRememberDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.remembersService.remove(+id);
  }
}
