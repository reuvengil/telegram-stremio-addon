import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { AccountEntity } from './account.entity';

// channelId + accessHash together let GramJS reference this channel again
// without re-resolving it from a dialog list - StringSession alone doesn't
// cache entities across process restarts, so these two fields are what we
// actually depend on for everything downstream (listing videos, streaming).
@Entity('channels')
@Index(['accountId', 'channelId'], { unique: true })
export class ChannelEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => AccountEntity, (a) => a.channels, { onDelete: 'CASCADE' })
  account!: AccountEntity;

  @Column()
  accountId!: string;

  @Column()
  channelId!: string;

  @Column()
  accessHash!: string;

  @Column()
  title!: string;

  @Column({ default: 'channel' })
  kind!: 'channel' | 'group';

  @CreateDateColumn()
  createdAt!: Date;
}
