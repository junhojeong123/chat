import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

@WebSocketGateway({ cors: true })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private clients: Map<string, { userId: string; nickname: string }> = new Map();

  constructor(private readonly chatService: ChatService) {}

  /**
   * 클라이언트 연결 시 실행
   */
  handleConnection(client: Socket) {
    const { userId, nickname } = client.handshake.auth;

    if (!userId || !nickname) {
      client.disconnect();
      return;
    }

    this.clients.set(client.id, { userId, nickname });
    console.log(`Client connected: ${nickname}`);
  }

  /**
   * 클라이언트 연결 해제 시 실행
   */
  handleDisconnect(client: Socket) {
    this.clients.delete(client.id);
    console.log('Client disconnected');
  }

  /**
   * 방 입장 이벤트
   */
  @SubscribeMessage('join_room')
  handleJoinRoom(client: Socket, data: { roomCode: string }) {
    const { roomCode } = data;

    if (!roomCode || roomCode.length < 4) {
      client.emit('error', { reason: 'Invalid room code' });
      return;
    }

    client.join(roomCode);
    client.emit('joined_room', { roomCode });

    client.to(roomCode).emit('user_joined', {
      nickname: this.clients.get(client.id)?.nickname,
    });
  }

  /**
   * 메시지 전송 이벤트
   * → DB 저장 포함
   */
  @SubscribeMessage('send_message')
  async handleMessage(client: Socket, data: { roomCode: string; message: string }) {
    const { roomCode, message } = data;
    const user = this.clients.get(client.id);

    if (!user) {
      client.emit('error', { reason: 'Unauthorized' });
      return;
    }

    if (!roomCode || !message) {
      client.emit('error', { reason: 'Invalid message data' });
      return;
    }

    const payload = {
      senderId: user.userId,
      nickname: user.nickname,
      message,
      roomCode,
    };

    //  DB 저장
    await this.chatService.saveMessage(payload);

    //  메시지 브로드캐스트
    this.server.to(roomCode).emit('receive_message', {
      ...payload,
      timestamp: new Date(),
    });
  }

  /**
   * 채팅 로그 조회
   */
  @SubscribeMessage('get_chat_logs')
  async handleGetChatLogs(client: Socket, data: { roomCode: string }) {
    const logs = await this.chatService.getMessages(data.roomCode);
    client.emit('chat_logs', logs);
  }
}
