import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { StudyGroup, StudyGroupSchema } from '../groups/schemas/study-group.schema';
import { PointsEvent, PointsEventSchema } from '../gamification/schemas/points-event.schema';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

// Read-only aggregate over existing collections -- registers the models it reads directly
// (User / StudyGroup / PointsEvent) rather than importing their feature modules.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: StudyGroup.name, schema: StudyGroupSchema },
      { name: PointsEvent.name, schema: PointsEventSchema },
    ]),
  ],
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
