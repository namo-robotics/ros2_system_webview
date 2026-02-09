declare module "roslib" {
  export class Ros {
    constructor(options: { url: string });
    on(event: "connection" | "error" | "close", callback: (event?: any) => void): void;
    close(): void;
  }

  export class Topic {
    constructor(options: { ros: Ros; name: string; messageType: string });
    subscribe(callback: (message: any) => void): void;
    unsubscribe(): void;
  }
}
