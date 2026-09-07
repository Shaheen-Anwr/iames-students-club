import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { E2eePreKey, E2eePreKeySchema } from './schemas/e2ee-prekey.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { E2eeService } from './e2ee.service';
import { E2eeController } from './e2ee.controller';

// Chat end-to-end encryption key registry. See docs/e2ee-design.md. Endpoints are inert until
// E2EE_ENABLED=1. Registers the User model directly (leaf module, like PushModule/DigestModule).
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: E2eePreKey.name, schema: E2eePreKeySchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [E2eeController],
  providers: [E2eeService],
})
export class E2eeModule {}
