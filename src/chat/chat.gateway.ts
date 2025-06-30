import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: true })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  // 연결된 클라이언트 정보 저장 (key: socket.id)
  private clients: Map<string, { userId: string; nickname: string }> = new Map();

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
   * 클라이언트가 방 코드를 통해 채팅방에 참여
   */
  @SubscribeMessage('join_room')
  handleJoinRoom(client: Socket, data: { roomCode: string }) {
    const { roomCode } = data;

    // 방 코드 유효성 검사 (예: 4자리 이상)
    if (!roomCode || roomCode.length < 4) {
      client.emit('error', { reason: 'Invalid room code' });
      return;
    }

    // 방 입장
    client.join(roomCode);
    client.emit('joined_room', { roomCode });

    // 방 내 다른 사용자에게 입장 알림
    client.to(roomCode).emit('user_joined', {
      nickname: this.clients.get(client.id)?.nickname,
    });
  }

  /**
   * 메시지 전송 이벤트
   */
  @SubscribeMessage('send_message')
  handleMessage(client: Socket, data: { roomCode: string; message: string }) {
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

    // 방 내 모든 사용자에게 메시지 전달
    this.server.to(roomCode).emit('receive_message', {
      senderId: user.userId,
      nickname: user.nickname,
      message,
      timestamp: new Date(),
    });
  }
}