import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ScheduleModule } from '../schedule/schedule.module';
import { AssignmentsModule } from '../assignments/assignments.module';
import { AnnouncementsModule } from '../announcements/announcements.module';
import { PushModule } from '../push/push.module';
import { GamificationModule } from '../gamification/gamification.module';
import { DigestService } from './digest.service';
import { DigestController } from './digest.controller';

// Registers the User model directly rather than importing UsersModule -- matches PushModule's
// approach and keeps this leaf module out of the users <-> notifications <-> push chain.
@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    ScheduleModule,
    AssignmentsModule,
    AnnouncementsModule,
    PushModule,
    GamificationModule,
  ],
  controllers: [DigestController],
  providers: [DigestService],
})
export class DigestModule {}
