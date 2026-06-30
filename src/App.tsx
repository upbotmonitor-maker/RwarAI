import { useState, useEffect, useRef } from "react";
import {
  Plus,
  MessageSquare,
  Send,
  Settings,
  LogOut,
  User,
  Paperclip,
  Trash2,
  Menu,
  X,
  Edit2,
  XCircle,
  FileText,
  Sparkles,
  Trophy,
  Image as ImageIcon,
  PenLine,
  BookOpen,
  Folder,
  Grid,
  MoreHorizontal,
  Search,
  Globe
} from "lucide-react";
import { Chat, Message } from "./types";
import {
  getInitialState,
  saveStateToLocalStorage,
  getFormattedDate,
  getFormattedTime,
  groupChatsByDate
} from "./utils";
import ReactMarkdown from "react-markdown";

export default function App() {
  const [state, setState] = useState(() => getInitialState());
  const [inputText, setInputText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitleText, setEditingTitleText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Custom user profile and preferences (Default User name is elegantly set to "Kullanıcı" or customizable)
  const [userName, setUserName] = useState(() => {
    const stored = localStorage.getItem("rwar_user_name");
    if (stored) return stored;
    return "Kullanıcı";
  });
  const [userApiKey, setUserApiKey] = useState(() => {
    return state.apiKey || localStorage.getItem("rwar_user_api_key") || "";
  });
  const [selectedAvatarTheme, setSelectedAvatarTheme] = useState(() => {
    return localStorage.getItem("rwar_avatar_theme") || "dark_compact";
  });

  // Streaming assistant message state
  const [streamingText, setStreamingText] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [streamingGroundingMetadata, setStreamingGroundingMetadata] = useState<any>(null);

  // Simulated file upload state
  const [attachedFile, setAttachedFile] = useState<{ name: string; size: string; content?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync state changes to localStorage
  useEffect(() => {
    saveStateToLocalStorage({
      ...state,
      apiKey: userApiKey
    });
  }, [state, userApiKey]);

  // Scroll to bottom on new messages or streaming updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.currentChatId, state.chats, streamingText]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [inputText]);

  const activeChat = state.currentChatId ? state.chats[state.currentChatId] : null;

  // Initialize a new blank chat session
  const handleNewChat = () => {
    const newId = `chat_${Date.now()}`;
    const now = new Date();
    const newChat: Chat = {
      title: "Yeni Sohbet",
      date: getFormattedDate(now),
      time: getFormattedTime(now),
      messages: []
    };

    setState((prev) => ({
      ...prev,
      chats: {
        ...prev.chats,
        [newId]: newChat
      },
      currentChatId: newId
    }));
    
    setInputText("");
    setAttachedFile(null);
    setSidebarOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  // Handle sending message
  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText !== undefined ? customText : inputText;
    if (!textToSend.trim() && !attachedFile) return;
    if (isGenerating) return;

    let chatId = state.currentChatId;
    let chatsCopy = { ...state.chats };
    const now = new Date();
    const messageTime = getFormattedTime(now);

    // If there is no current chat or empty chats list, create a new one
    if (!chatId || !chatsCopy[chatId]) {
      chatId = `chat_${Date.now()}`;
      chatsCopy[chatId] = {
        title: "Yeni Sohbet",
        date: getFormattedDate(now),
        time: messageTime,
        messages: []
      };
    }

    // Prepare content with attachment notice if present
    let finalContent = textToSend;
    if (attachedFile) {
      finalContent = `[Dosya Eklendi: ${attachedFile.name} (${attachedFile.size})]\n\n${textToSend}`;
    }

    const userMessage: Message = {
      role: "user",
      content: finalContent,
      time: messageTime
    };

    // Update state with user message
    const updatedMessages = [...chatsCopy[chatId].messages, userMessage];
    
    // Auto generate title if it is the first message or default name
    let chatTitle = chatsCopy[chatId].title;
    if (chatsCopy[chatId].messages.length === 0 || chatTitle === "Yeni Sohbet") {
      chatTitle = textToSend.trim().substring(0, 35) || `${attachedFile?.name.substring(0, 20)} Analizi`;
      if (textToSend.trim().length > 35) chatTitle += "...";
    }

    chatsCopy[chatId] = {
      ...chatsCopy[chatId],
      title: chatTitle,
      messages: updatedMessages
    };

    setState((prev) => ({
      ...prev,
      chats: chatsCopy,
      currentChatId: chatId
    }));

    setInputText("");
    setAttachedFile(null);
    setIsGenerating(true);
    setStreamingText("");
    setStreamingGroundingMetadata(null);

    try {
      const payloadMessages = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content
      }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: payloadMessages,
          apiKey: userApiKey || undefined,
          searchMode: searchActive
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP Hata: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");

      if (!reader) {
        throw new Error("Yanıt okuyucu başlatılamadı.");
      }

      let accumulatedAnswer = "";
      let accumulatedGroundingMetadata: any = null;
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value);
        const lines = chunkText.split("\n");

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const dataStr = trimmed.substring(6);
            if (dataStr === "[DONE]") {
              break;
            }
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.text) {
                accumulatedAnswer += parsed.text;
                setStreamingText(accumulatedAnswer);
              }
              if (parsed.groundingMetadata) {
                accumulatedGroundingMetadata = parsed.groundingMetadata;
                setStreamingGroundingMetadata(parsed.groundingMetadata);
              }
              if (parsed.error) {
                throw new Error(parsed.error);
              }
            } catch (err) {
              if (dataStr.includes('"error"')) {
                throw err;
              }
            }
          }
        }
      }

      // Commit finalized assistant message to the active chat
      const finalAssistantMessage: Message = {
        role: "assistant",
        content: accumulatedAnswer || "Üzgünüm, yanıt oluşturulurken bir hata oluştu.",
        time: getFormattedTime(new Date()),
        searchMode: searchActive,
        groundingMetadata: accumulatedGroundingMetadata
      };

      setState((prev) => {
        const cId = prev.currentChatId!;
        const existingChat = prev.chats[cId];
        return {
          ...prev,
          chats: {
            ...prev.chats,
            [cId]: {
              ...existingChat,
              messages: [...existingChat.messages, finalAssistantMessage]
            }
          }
        };
      });

    } catch (error: any) {
      console.error("Failed to generate response:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: `⚠️ **Hata:** ${error.message || "Bağlantı sorunu oluştu. Lütfen daha sonra tekrar deneyin."}`,
        time: getFormattedTime(new Date())
      };

      setState((prev) => {
        const cId = prev.currentChatId!;
        const existingChat = prev.chats[cId];
        return {
          ...prev,
          chats: {
            ...prev.chats,
            [cId]: {
              ...existingChat,
              messages: [...existingChat.messages, errorMessage]
            }
          }
        };
      });
    } finally {
      setIsGenerating(false);
      setStreamingText("");
    }
  };

  // Keyboard shortcut handler for textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Switch active chat
  const handleSelectChat = (id: string) => {
    setState((prev) => ({
      ...prev,
      currentChatId: id
    }));
    setSidebarOpen(false);
  };

  // Edit chat title
  const startEditingTitle = (id: string, currentTitle: string) => {
    setEditingChatId(id);
    setEditingTitleText(currentTitle);
  };

  const saveChatTitle = (id: string) => {
    if (!editingTitleText.trim()) return;
    setState((prev) => ({
      ...prev,
      chats: {
        ...prev.chats,
        [id]: {
          ...prev.chats[id],
          title: editingTitleText.trim().substring(0, 30)
        }
      }
    }));
    setEditingChatId(null);
  };

  // Delete chat session
  const handleDeleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setState((prev) => {
      const updatedChats = { ...prev.chats };
      delete updatedChats[id];
      
      let nextId = prev.currentChatId;
      if (nextId === id) {
        const remainingKeys = Object.keys(updatedChats);
        nextId = remainingKeys.length > 0 ? remainingKeys[0] : null;
      }

      return {
        ...prev,
        chats: updatedChats,
        currentChatId: nextId
      };
    });
  };

  // File Upload handler
  const handleFileUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const sizeStr = file.size > 1024 * 1024 
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` 
        : `${(file.size / 1024).toFixed(0)} KB`;
      setAttachedFile({
        name: file.name,
        size: sizeStr
      });
    }
  };

  // Grouped chats (filtered by search query if any)
  const getFilteredChats = () => {
    if (!searchQuery.trim()) return state.chats;
    const filtered: Record<string, Chat> = {};
    const query = searchQuery.toLowerCase();
    for (const [id, chat] of Object.entries(state.chats)) {
      const titleMatch = chat.title.toLowerCase().includes(query);
      const messagesMatch = chat.messages.some(m => m.content.toLowerCase().includes(query));
      if (titleMatch || messagesMatch) {
        filtered[id] = chat;
      }
    }
    return filtered;
  };

  const grouped = groupChatsByDate(getFilteredChats());

  // Clear all chats & reset to defaults (Strictly use "Kullanıcı" as default name, no brand references)
  const handleLogout = () => {
    if (confirm("Tüm sohbet geçmişiniz temizlenecektir. Emin misiniz?")) {
      localStorage.removeItem("rwar_chat_state");
      localStorage.removeItem("rwar_user_name");
      localStorage.removeItem("rwar_avatar_theme");
      const freshState = getInitialState();
      setState(freshState);
      setUserName("Kullanıcı");
      setSelectedAvatarTheme("dark_compact");
      setSidebarOpen(false);
    }
  };

  // Render group list helper
  const renderChatGroup = (title: string, list: [string, Chat][]) => {
    if (list.length === 0) return null;
    return (
      <div className="mb-5">
        <div className="px-3 py-1.5 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
          {title}
        </div>
        <div className="space-y-0.5 mt-1">
          {list.map(([id, chat]) => {
            const isActive = state.currentChatId === id;
            const isEditing = editingChatId === id;

            return (
              <div
                key={id}
                onClick={() => !isEditing && handleSelectChat(id)}
                className={`group relative flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-all duration-150 cursor-pointer ${
                  isActive
                    ? "bg-[#212121] text-white font-normal"
                    : "text-neutral-300 hover:bg-[#171717]/60 hover:text-white"
                }`}
                id={`chat-item-${id}`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {isEditing ? (
                    <input
                      type="text"
                      value={editingTitleText}
                      onChange={(e) => setEditingTitleText(e.target.value)}
                      onBlur={() => saveChatTitle(id)}
                      onKeyDown={(e) => e.key === "Enter" && saveChatTitle(id)}
                      autoFocus
                      className="w-full bg-[#0d0d0d] border border-neutral-700 rounded px-1.5 py-0.5 text-sm text-white focus:outline-none focus:border-neutral-500"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="truncate pr-4 text-[13.5px] font-light leading-relaxed">
                      {chat.title || "Yeni Sohbet"}
                    </span>
                  )}
                </div>

                {!isEditing && (
                  <div className="absolute right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1.5 transition-opacity duration-150 bg-gradient-to-l from-[#171717] via-[#171717] pl-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditingTitle(id, chat.title);
                      }}
                      className="p-1 text-neutral-400 hover:text-white rounded transition"
                      title="Başlığı Düzenle"
                      id={`edit-title-btn-${id}`}
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteChat(id, e)}
                      className="p-1 text-neutral-400 hover:text-red-400 rounded transition"
                      title="Sohbeti Sil"
                      id={`delete-chat-btn-${id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen w-full bg-[#0d0d0d] text-[#ececec] overflow-hidden font-sans select-none" id="rwar-app-container">
      {/* MOBILE HEADER */}
      <div className="md:hidden absolute top-0 left-0 right-0 h-14 bg-[#0d0d0d] border-b border-[#212121]/50 flex items-center justify-between px-3 z-30" id="mobile-header">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-3 text-neutral-300 hover:text-white transition active:scale-95"
          id="mobile-menu-open-btn"
          style={{ minWidth: '44px', minHeight: '44px' }}
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-neutral-200">Rwar</span>
          <span className="text-[9px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded font-mono font-semibold">1.0</span>
        </div>
        <button
          onClick={handleNewChat}
          className="p-3 text-neutral-300 hover:text-white transition active:scale-95"
          id="mobile-new-chat-btn"
          style={{ minWidth: '44px', minHeight: '44px' }}
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* LEFT SIDEBAR (Styled exactly like ChatGPT's modern drawer) */}
      <div
        className={`fixed inset-y-0 left-0 transform ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:relative md:translate-x-0 transition-transform duration-200 ease-in-out w-[260px] bg-[#171717] flex flex-col z-40`}
        id="sidebar-container"
      >
        {/* Sidebar Header with Brand and Search Icon */}
        <div className="h-14 px-4 flex items-center justify-between shrink-0">
          <span className="text-base font-semibold text-white tracking-wide">Rwar</span>
          
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition"
              id="mobile-menu-close-btn"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ChatGPT Custom Section Menu: Kitaplık, Projeler, Uygulamalar */}
        <div className="px-3 py-1 space-y-0.5 shrink-0 border-b border-neutral-800/40 pb-3">
          <div className="flex items-center gap-3 px-3 py-2 text-sm text-neutral-200 rounded-lg hover:bg-[#212121] transition cursor-pointer">
            <BookOpen className="h-4 w-4 text-neutral-400" />
            <span className="text-[13px] font-normal">Kitaplık</span>
          </div>
          <div className="flex items-center gap-3 px-3 py-2 text-sm text-neutral-200 rounded-lg hover:bg-[#212121] transition cursor-pointer">
            <Folder className="h-4 w-4 text-neutral-400" />
            <span className="text-[13px] font-normal">Projeler</span>
          </div>
          <div className="flex items-center gap-3 px-3 py-2 text-sm text-neutral-200 rounded-lg hover:bg-[#212121] transition cursor-pointer">
            <Grid className="h-4 w-4 text-neutral-400" />
            <span className="text-[13px] font-normal">Uygulamalar</span>
          </div>

          {/* Search inside sidebar to find chats quickly */}
          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-500" />
            <input
              type="text"
              placeholder="Sohbetlerde ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0d0d0d] hover:bg-[#0d0d0d]/80 text-[12px] text-neutral-300 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-neutral-700 placeholder-neutral-600 font-light"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-2.5 text-neutral-500 hover:text-neutral-300">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Recents Category Header */}
        <div className="px-3 pt-4 pb-1 shrink-0">
          <span className="px-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block">
            Yakın Zamandakiler
          </span>
        </div>

        {/* Chat History Grouped Lists */}
        <div className="flex-1 overflow-y-auto px-2 space-y-1 scrollbar-thin" id="sidebar-history-scroll">
          {Object.keys(state.chats).length === 0 ? (
            <div className="text-center py-12 px-4 text-neutral-500">
              <MessageSquare className="h-6 w-6 mx-auto mb-2 opacity-30" />
              <p className="text-[12px] font-light">Sohbet geçmişi henüz yok</p>
            </div>
          ) : (
            <>
              {renderChatGroup("Bugün", grouped.today)}
              {renderChatGroup("Dün", grouped.yesterday)}
              {renderChatGroup("Önceki Hafta", grouped.previousWeek)}
              {renderChatGroup("Daha Eski", grouped.older)}
            </>
          )}
        </div>

        {/* Sidebar Footer (Elegant matching blue Sohbet button & settings next to it) */}
        <div className="p-3 border-t border-neutral-800 bg-[#171717] shrink-0" id="sidebar-footer">
          {/* User profile with custom profile name input from settings */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 mb-2.5 rounded-lg text-xs cursor-default">
            <div className="h-7 w-7 rounded-full bg-neutral-700 flex items-center justify-center text-neutral-200 font-semibold border border-neutral-600">
              <User className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[13px] font-normal text-neutral-200 block truncate leading-tight">{userName}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Elegant Blue Pill "Sohbet" button just like ChatGPT's drawer */}
            <button
              onClick={handleNewChat}
              className="flex-1 bg-[#1a73e8] hover:bg-[#1a73e8]/90 text-white font-medium py-2 px-4 rounded-full flex items-center justify-center gap-1.5 text-xs transition active:scale-[0.98]"
              id="sidebar-sohbet-pill-btn"
            >
              <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>Sohbet</span>
            </button>

            {/* Circular Settings button */}
            <button
              onClick={() => setSettingsModalOpen(true)}
              className="p-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-full transition shrink-0"
              title="Ayarlar"
              id="sidebar-settings-btn"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>

            {/* Clear All Button */}
            <button
              onClick={handleLogout}
              className="p-2 bg-neutral-800/60 hover:bg-red-950/40 text-neutral-400 hover:text-red-400 rounded-full transition shrink-0"
              title="Temizle"
              id="sidebar-logout-btn"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Backdrop for mobile drawer */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="md:hidden fixed inset-0 bg-black/75 backdrop-blur-xs z-30 transition-opacity duration-200"
          id="mobile-drawer-backdrop"
        ></div>
      )}

      {/* RIGHT MAIN AREA */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative pt-14 md:pt-0" id="chat-area-container">
        {/* Top Header Selector - ChatGPT Theme */}
        <div className="h-14 px-6 border-b border-[#212121]/40 flex items-center justify-between bg-[#0d0d0d]/90 backdrop-blur-md shrink-0 z-20">
          <div className="flex items-center gap-2">
            {/* Pill selector resembling Model Dropdown in ChatGPT */}
            <div className="bg-[#212121] hover:bg-[#2f2f2f] text-neutral-300 rounded-full py-1.5 px-3.5 text-xs inline-flex items-center gap-1.5 cursor-pointer border border-[#2f2f2f]/60 transition">
              <Sparkles className="h-3 w-3 text-purple-400" />
              <span className="font-medium text-neutral-200">Rwar 3.5</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleNewChat}
              className="hidden md:flex p-2 text-neutral-400 hover:text-white transition hover:bg-[#212121] rounded-lg"
              title="Yeni Sohbet Başlat"
              id="desktop-new-chat-top-btn"
            >
              <Plus className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        {/* Active conversation message list (Premium ChatGPT clean style) */}
        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-6 scrollbar-thin" id="messages-container">
          {!activeChat || activeChat.messages.length === 0 ? (
            /* Welcome / Intro Page when no messages */
            <div className="max-w-2xl mx-auto h-full flex flex-col items-center justify-center text-center px-4 pt-10 pb-20">
              <div className="h-11 w-11 rounded-full bg-neutral-800 flex items-center justify-center mb-6 border border-neutral-700/60 shadow-lg shadow-black/30">
                <span className="text-white font-extrabold text-sm tracking-tighter">Rw</span>
              </div>
              
              <div className="space-y-2 mb-10">
                <h1 className="text-2xl font-semibold text-white tracking-tight">Size nasıl yardımcı olabilirim?</h1>
              </div>

              {/* Suggestions directly matching ChatGPT UI visual style from mobile screenshot */}
              <div className="w-full max-w-lg space-y-2">
                <button
                  onClick={() => {
                    setInputText("Dünya Kupası'nı takip et");
                    textareaRef.current?.focus();
                  }}
                  className="w-full py-3.5 px-5 bg-[#212121] hover:bg-[#2f2f2f] rounded-2xl text-left transition text-sm flex items-center gap-3.5 border border-transparent hover:border-neutral-800"
                >
                  <Trophy className="h-4 w-4 text-yellow-500 shrink-0" />
                  <span className="text-neutral-200 font-light">Dünya Kupası'nı takip et</span>
                </button>
                <button
                  onClick={() => {
                    setInputText("Görsel oluştur");
                    textareaRef.current?.focus();
                  }}
                  className="w-full py-3.5 px-5 bg-[#212121] hover:bg-[#2f2f2f] rounded-2xl text-left transition text-sm flex items-center gap-3.5 border border-transparent hover:border-neutral-800"
                >
                  <ImageIcon className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span className="text-neutral-200 font-light">Görsel oluştur</span>
                </button>
                <button
                  onClick={() => {
                    setInputText("Yaz veya düzenle");
                    textareaRef.current?.focus();
                  }}
                  className="w-full py-3.5 px-5 bg-[#212121] hover:bg-[#2f2f2f] rounded-2xl text-left transition text-sm flex items-center gap-3.5 border border-transparent hover:border-neutral-800"
                >
                  <PenLine className="h-4 w-4 text-sky-500 shrink-0" />
                  <span className="text-neutral-200 font-light">Yaz veya düzenle</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-8 pb-10">
              {activeChat.messages.map((msg, index) => {
                const isUser = msg.role === "user";
                return (
                  <div
                    key={index}
                    className={`flex items-start gap-4 ${isUser ? "justify-end" : "justify-start"}`}
                    id={`message-row-${index}`}
                  >
                    {/* Assistant Icon (ChatGPT layout has a clean simple model icon on the left) */}
                    {!isUser && (
                      <div className="h-7 w-7 rounded-full bg-neutral-800 border border-neutral-700/60 flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                        <span className="text-purple-400 font-bold text-[10px]">Rw</span>
                      </div>
                    )}

                    <div className={isUser ? "max-w-[85%]" : "flex-1 max-w-[90%] space-y-1"}>
                      {/* Message Body */}
                      {isUser ? (
                        /* User Message: Clean dark gray pill on the right, exactly matching ChatGPT web/mobile */
                        <div className="rounded-2xl px-4 py-2.5 text-[14.5px] leading-relaxed break-words bg-[#212121] text-neutral-100 font-light">
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                        </div>
                      ) : (
                        /* Assistant Message: No background bubble, clean text aligned elegantly with great line-height */
                        <div className="text-[14.5px] leading-relaxed break-words text-neutral-200 font-light font-sans">
                          <div className="prose prose-invert prose-sm max-w-none text-neutral-200">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>

                          {msg.groundingMetadata?.groundingChunks && msg.groundingMetadata.groundingChunks.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-neutral-800/40">
                              <div className="text-xs text-neutral-400 font-normal w-full mb-1 flex items-center gap-1.5">
                                <Globe className="h-3.5 w-3.5 text-sky-400" />
                                <span>Kaynaklar:</span>
                              </div>
                              {msg.groundingMetadata.groundingChunks.map((chunk, cIdx) => {
                                const src = chunk.web;
                                if (!src || !src.uri) return null;
                                let domain = "";
                                try {
                                  domain = new URL(src.uri).hostname.replace("www.", "");
                                } catch (e) {
                                  domain = "web";
                                }
                                return (
                                  <a
                                    key={cIdx}
                                    href={src.uri}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 bg-[#212121]/50 hover:bg-[#2f2f2f]/80 text-xs text-neutral-300 hover:text-white px-3 py-1.5 rounded-full transition border border-neutral-800/60 max-w-xs truncate"
                                    title={src.title || src.uri}
                                  >
                                    <span className="truncate max-w-[150px] font-normal text-[12px]">{src.title || domain}</span>
                                    <span className="text-[10px] text-neutral-500 font-mono">({domain})</span>
                                  </a>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* User Icon (ChatGPT layout has user initials or simple avatar on right) */}
                    {isUser && (
                      <div className="h-7 w-7 rounded-full bg-neutral-700 flex items-center justify-center shrink-0 shadow-sm mt-0.5 border border-neutral-600">
                        <User className="h-3.5 w-3.5 text-neutral-200" />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Streaming AI response representation */}
              {isGenerating && streamingText && (
                <div className="flex items-start gap-4 justify-start" id="message-streaming-row">
                  <div className="h-7 w-7 rounded-full bg-neutral-800 border border-neutral-700/60 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <span className="text-purple-400 font-bold text-[10px]">Rw</span>
                  </div>

                  <div className="flex-1 max-w-[90%]">
                    <div className="text-[14.5px] leading-relaxed break-words text-neutral-200 font-light font-sans">
                      <div className="prose prose-invert prose-sm max-w-none text-neutral-200 inline">
                        <ReactMarkdown>{streamingText}</ReactMarkdown>
                      </div>
                      <span className="inline-block h-4 w-2 bg-neutral-400 ml-1.5 animate-pulse rounded-xs align-middle"></span>

                      {streamingGroundingMetadata?.groundingChunks && streamingGroundingMetadata.groundingChunks.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-neutral-800/40">
                          <div className="text-xs text-neutral-400 font-normal w-full mb-1 flex items-center gap-1.5">
                            <Globe className="h-3.5 w-3.5 text-sky-400 animate-spin" style={{ animationDuration: '3s' }} />
                            <span>Bulunan Kaynaklar:</span>
                          </div>
                          {streamingGroundingMetadata.groundingChunks.map((chunk: any, cIdx: number) => {
                            const src = chunk.web;
                            if (!src || !src.uri) return null;
                            let domain = "";
                            try {
                              domain = new URL(src.uri).hostname.replace("www.", "");
                            } catch (e) {
                              domain = "web";
                            }
                            return (
                              <a
                                key={cIdx}
                                href={src.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 bg-[#212121]/50 hover:bg-[#2f2f2f]/80 text-xs text-neutral-300 hover:text-white px-3 py-1.5 rounded-full transition border border-neutral-800/60 max-w-xs truncate"
                                title={src.title || src.uri}
                              >
                                <span className="truncate max-w-[150px] font-normal text-[12px]">{src.title || domain}</span>
                                <span className="text-[10px] text-neutral-500 font-mono">({domain})</span>
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Loading Indicator waiting for stream */}
              {isGenerating && !streamingText && (
                <div className="flex items-start gap-4 justify-start" id="message-loading-row">
                  <div className="h-7 w-7 rounded-full bg-neutral-800 border border-neutral-700/60 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <span className="text-purple-400 font-bold text-[10px]">Rw</span>
                  </div>

                  <div className="flex items-center gap-1 px-1 py-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-neutral-500 animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="h-1.5 w-1.5 rounded-full bg-neutral-500 animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="h-1.5 w-1.5 rounded-full bg-neutral-500 animate-bounce"></span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Bottom Input Area */}
        <div className="p-4 md:p-6 bg-[#0d0d0d] shrink-0 z-10">
          <div className="max-w-2xl mx-auto">
            {/* Attachment preview if active */}
            {attachedFile && (
              <div className="flex items-center justify-between bg-[#212121] border border-neutral-800 rounded-xl px-4 py-2.5 mb-3 text-xs text-neutral-300" id="attachment-preview">
                <div className="flex items-center gap-2.5">
                  <FileText className="h-4 w-4 text-sky-400" />
                  <div>
                    <span className="font-medium text-white block">{attachedFile.name}</span>
                    <span className="text-neutral-500 font-light">{attachedFile.size}</span>
                  </div>
                </div>
                <button
                  onClick={() => setAttachedFile(null)}
                  className="p-1 text-neutral-400 hover:text-white rounded-lg transition"
                  title="Dosyayı kaldır"
                  id="remove-file-btn"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Input field resembling ChatGPT's elegant capsule bar */}
            <div className="relative bg-[#212121] rounded-3xl p-2 transition duration-150">
              {/* Hidden simulated file input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                id="rwar-file-input"
              />

              <div className="flex items-end gap-2 pl-2">
                {/* Plus File Upload Trigger */}
                <button
                  onClick={handleFileUploadClick}
                  className="p-2 text-neutral-400 hover:text-white hover:bg-[#2f2f2f] rounded-full transition shrink-0 mb-0.5"
                  title="Dosya Ekle"
                  id="attach-file-btn"
                >
                  <Paperclip className="h-4.5 w-4.5" />
                </button>

                {/* Web Search Toggle Button (Globe) */}
                <button
                  onClick={() => setSearchActive(!searchActive)}
                  className={`p-2 rounded-full transition shrink-0 mb-0.5 relative ${
                    searchActive
                      ? "text-sky-400 bg-sky-950/20 border border-sky-900/40 hover:bg-sky-950/40"
                      : "text-neutral-400 hover:text-white hover:bg-[#2f2f2f]"
                  }`}
                  title={searchActive ? "Web Araması Aktif" : "Web Araması Kapalı (Ara Modu)"}
                  id="web-search-toggle-btn"
                >
                  <Globe className={`h-4.5 w-4.5 ${searchActive ? "animate-pulse" : ""}`} />
                  {searchActive && (
                    <span className="absolute top-1 right-1 flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-sky-500"></span>
                    </span>
                  )}
                </button>

                {/* Text area */}
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Rwar'a sor..."
                  rows={1}
                  className="flex-1 bg-transparent text-[#ececec] placeholder-neutral-500 text-[14px] font-light focus:outline-none resize-none py-2 px-1 max-h-48 font-sans leading-relaxed"
                  id="message-textarea"
                />

                {/* Send Button: Solid beautiful circle send button matching screenshot */}
                <button
                  onClick={() => handleSendMessage()}
                  disabled={(!inputText.trim() && !attachedFile) || isGenerating}
                  className={`h-9 w-9 rounded-full flex items-center justify-center transition shrink-0 mb-0.5 ${
                    (inputText.trim() || attachedFile) && !isGenerating
                      ? "bg-[#1a73e8] hover:bg-[#1a73e8]/90 text-white shadow-sm cursor-pointer"
                      : "bg-[#2f2f2f] text-neutral-600 cursor-not-allowed"
                  }`}
                  id="send-message-btn"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Disclaimer Footer resembling standard ChatGPT subtext */}
            <div className="text-[11px] text-center text-neutral-600 mt-3 font-light tracking-wide">
              Rwar hata yapabilir. Önemli bilgileri kontrol edin.
            </div>
          </div>
        </div>
      </div>

      {/* SETTINGS MODAL */}
      {settingsModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4" id="settings-modal-backdrop">
          <div className="bg-[#171717] border border-neutral-800 rounded-2xl w-full max-w-md p-6 overflow-hidden shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            
            <button
              onClick={() => setSettingsModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-neutral-400 hover:text-white hover:bg-[#212121] rounded-lg transition"
              id="close-settings-modal-btn"
            >
              <X className="h-4.5 w-4.5" />
            </button>

            <div className="flex items-center gap-2 mb-6">
              <Settings className="h-4.5 w-4.5 text-purple-400" />
              <h2 className="text-base font-semibold text-white">Rwar Ayarları</h2>
            </div>

            <div className="space-y-4">
              {/* Profile section */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
                  👤 Kullanıcı Adınız
                </label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => {
                    setUserName(e.target.value);
                    localStorage.setItem("rwar_user_name", e.target.value);
                  }}
                  className="w-full bg-[#0d0d0d] border border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-neutral-700 font-light"
                  placeholder="Kullanıcı adınızı girin..."
                />
              </div>

              {/* Private API Key configuration (Completely Optional & Discreet) */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>🔑 Gemini API Anahtarı (İsteğe Bağlı)</span>
                </label>
                <input
                  type="password"
                  value={userApiKey}
                  onChange={(e) => {
                    setUserApiKey(e.target.value);
                    localStorage.setItem("rwar_user_api_key", e.target.value);
                  }}
                  className="w-full bg-[#0d0d0d] border border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-neutral-700 font-mono"
                  placeholder="Kendi anahtarınızı girmek isterseniz..."
                />
                <p className="text-[11px] text-neutral-500 mt-1.5 font-light leading-relaxed">
                  Uygulama zaten sunucumuz üzerinden ücretsiz çalışmaktadır. Ek kotalar veya kendi anahtarınızı kullanmak için buraya API anahtarınızı tanımlayabilirsiniz.
                </p>
              </div>

              {/* Theme Settings Selection */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
                  🌌 Görünüm Teması
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      setSelectedAvatarTheme("dark_compact");
                      localStorage.setItem("rwar_avatar_theme", "dark_compact");
                    }}
                    className={`p-2 rounded-xl text-xs font-normal border text-center transition ${
                      selectedAvatarTheme === "dark_compact"
                        ? "bg-neutral-800 border-neutral-600 text-white font-medium"
                        : "bg-[#0d0d0d] border-neutral-800 text-neutral-400 hover:text-white"
                    }`}
                  >
                    Karanlık 🌑
                  </button>
                  <button
                    onClick={() => {
                      setSelectedAvatarTheme("cosmic");
                      localStorage.setItem("rwar_avatar_theme", "cosmic");
                    }}
                    className={`p-2 rounded-xl text-xs font-normal border text-center transition ${
                      selectedAvatarTheme === "cosmic"
                        ? "bg-purple-950/20 border-purple-800 text-purple-300 font-medium"
                        : "bg-[#0d0d0d] border-neutral-800 text-neutral-400 hover:text-white"
                    }`}
                  >
                    Kozmik 🌌
                  </button>
                  <button
                    onClick={() => {
                      setSelectedAvatarTheme("cyber");
                      localStorage.setItem("rwar_avatar_theme", "cyber");
                    }}
                    className={`p-2 rounded-xl text-xs font-normal border text-center transition ${
                      selectedAvatarTheme === "cyber"
                        ? "bg-sky-950/20 border-sky-800 text-sky-300 font-medium"
                        : "bg-[#0d0d0d] border-neutral-800 text-neutral-400 hover:text-white"
                    }`}
                  >
                    Siber ⚡
                  </button>
                </div>
              </div>

              {/* Info stats */}
              <div className="pt-4 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-500 font-light">
                <span>Versiyon: 1.0.0</span>
                <span>Sunucu Durumu: Aktif 🟢</span>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSettingsModalOpen(false)}
                className="bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white px-4 py-2 rounded-xl text-xs font-normal transition"
                id="save-settings-btn"
              >
                Kaydet ve Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
