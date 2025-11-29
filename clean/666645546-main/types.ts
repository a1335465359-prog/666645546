export enum Priority {
  P0 = 'P0',
  P1 = 'P1',
  P2 = 'P2',
  P3 = 'P3',
  P4 = 'P4'
}

export interface Todo {
  id: string;
  title: string;
  description?: string;
  priority: Priority;
  isCompleted: boolean;
  createdAt: number;
  deadline?: number; // timestamp in ms
  notificationSent?: boolean;
  
  // Specific fields for Buyers
  shopId?: string;      // 店铺ID
  quantity?: string;    // 多少个
  actionTime?: string;  // 什么时候 (text description)
}

export interface AITaskResponse {
  tasks: {
    title: string;
    description: string;
    priority: 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
    estimatedMinutes?: number;
    shopId?: string;
    quantity?: string;
    actionTime?: string;
  }[];
}