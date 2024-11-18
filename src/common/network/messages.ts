import { HelloMessage } from "@common/network/messages/HelloMessage";
import { NetworkSide } from "@common/network/sides";
import * as Networker from "monorepo-networker";

export namespace NetworkMessages {
  export const registry = new Networker.MessageTypeRegistry();
  export const HELLO_PLUGIN = registry.register(
    new HelloMessage(NetworkSide.PLUGIN)
  );
}
