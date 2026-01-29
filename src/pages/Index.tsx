import { useChat } from "@/hooks/useChat";
import AppSidebar from "@/components/sidebar/AppSidebar";
import ChatMessages from "@/components/chat/ChatMessages";
import ChatInput from "@/components/chat/ChatInput";
import { executeQuery, executeExternalQuery, fetchExternalMetadata } from "@/lib/api";
import { useEffect, useState } from "react";

export default function Index() {
  const {
    conversations,
    currentConversationId,
    messages,
    isLoading,
    streamingContent,
    sendMessage,
    selectConversation,
    deleteConversation,
    createNewConversation,
  } = useChat();
  
  const [hasExternalDb, setHasExternalDb] = useState(false);

  // Check if external DB is configured
  useEffect(() => {
    fetchExternalMetadata()
      .then((data) => setHasExternalDb(data.length > 0))
      .catch(() => setHasExternalDb(false));
  }, []);

  const handleExecuteQuery = async (query: string, isExternal?: boolean) => {
    if (isExternal || hasExternalDb) {
      return await executeExternalQuery(query);
    }
    return await executeQuery(query);
  };

  return (
    <div className="flex h-screen bg-background">
      <AppSidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={selectConversation}
        onDeleteConversation={deleteConversation}
        onNewConversation={createNewConversation}
      />

      <main className="flex-1 flex flex-col">
        <ChatMessages
          messages={messages}
          isLoading={isLoading}
          streamingContent={streamingContent}
          onExecuteQuery={handleExecuteQuery}
        />

        <ChatInput
          onSend={sendMessage}
          isLoading={isLoading}
        />
      </main>
    </div>
  );
}
