import { PrismaClient, MessageRole, UserTier } from '@prisma/client';
import jwt from 'jsonwebtoken';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const user = await prisma.user.upsert({
    where: { email: 'demo@appnation.test' },
    update: {},
    create: {
      email: 'demo@appnation.test',
      name: 'Demo User',
      tier: UserTier.ENTERPRISE,
    },
  });

  await prisma.chat.deleteMany({ where: { userId: user.id } });

  for (let i = 0; i < 3; i += 1) {
    const chat = await prisma.chat.create({
      data: {
        userId: user.id,
        title: `Sample chat #${i + 1}`,
      },
    });
    await prisma.message.createMany({
      data: [
        { chatId: chat.id, role: MessageRole.USER, content: `Hello from chat ${i + 1}` },
        {
          chatId: chat.id,
          role: MessageRole.ASSISTANT,
          content: `Hi! This is a mocked reply for chat ${i + 1}.`,
        },
        {
          chatId: chat.id,
          role: MessageRole.USER,
          content: 'What is the weather in Istanbul?',
        },
        {
          chatId: chat.id,
          role: MessageRole.ASSISTANT,
          content: 'Sunny and warm — mocked weather.',
        },
      ],
    });
  }

  // Print a ready-to-use JWT for local curl testing.
  const secret = process.env.JWT_SECRET ?? 'super-secret-jwt-key-change-me-in-production';
  const token = jwt.sign(
    { sub: user.id, email: user.email, tier: user.tier },
    secret,
    { expiresIn: '24h' },
  );
  // eslint-disable-next-line no-console
  console.log(`\nSeeded user: ${user.email} (${user.id})`);
  // eslint-disable-next-line no-console
  console.log(`Test JWT (24h):\n${token}\n`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
