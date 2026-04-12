import cron from 'node-cron';
import amqplib from 'amqplib';
import { PrismaClient } from 'smas-shared';
import type Redis from 'ioredis';
type AmqplibChannel = Awaited<ReturnType<Awaited<ReturnType<typeof amqplib.connect>>['createChannel']>>;
export declare function enqueueDuePosts(prisma: PrismaClient, channel: AmqplibChannel, redis: Redis): Promise<number>;
export declare function startSchedulePoller(prisma: PrismaClient, rabbitmqUrl: string): cron.ScheduledTask;
export {};
