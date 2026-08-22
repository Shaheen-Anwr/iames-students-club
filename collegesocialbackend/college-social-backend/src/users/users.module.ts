import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { EmailModule } from '../email/email.module';
import { GamificationModule } from '../gamification/gamification.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]), EmailModule, GamificationModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
