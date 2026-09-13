import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1789323913987 implements MigrationInterface {
  name = 'Init1789323913987';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accounts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "sessionString" text NOT NULL,
        "displayName" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "channels" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "accountId" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
        "channelId" text NOT NULL,
        "accessHash" text NOT NULL,
        "title" text NOT NULL,
        "kind" text NOT NULL DEFAULT 'channel',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_channels_accountId_channelId"
      ON "channels" ("accountId", "channelId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_channels_accountId_channelId";`);
    await queryRunner.query(`DROP TABLE "channels";`);
    await queryRunner.query(`DROP TABLE "accounts";`);
  }
}
