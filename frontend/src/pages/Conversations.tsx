import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, ArrowLeft, Send, Clock, Check, CheckCheck, AlertCircle,
  FileText, X, User, Play, Image, Trash2, ChevronDown, MessageSquare, Paperclip, Mic,
} from 'lucide-react';
import { conversationsApi, templatesApi } from '../services/api';
import type { Conversation, MessageLogEntry, MessageStatus, MessageTemplate } from '../types';

/* ─── Unread tracking via localStorage ─── */

const LAST_READ_KEY = 'shuddhika_conversation_last_read';

function getLastRead(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LAST_READ_KEY) || '{}');
  } catch { return {}; }
}

function markAsRead(leadId: string) {
  const map = getLastRead();
  map[leadId] = new Date().toISOString();
  localStorage.setItem(LAST_READ_KEY, JSON.stringify(map));
}

function isUnread(conv: Conversation): boolean {
  if (!conv.lastMessage) return false;
  if (conv.lastMessage.direction !== 'INBOUND') return false;
  const lastRead = getLastRead()[conv.leadId];
  if (!lastRead) return true;
  return new Date(conv.lastMessage.createdAt).getTime() > new Date(lastRead).getTime();
}

export default function Conversations() {
  const queryClient = useQueryClient();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageText, setMessageText] = useState('');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ leadId: string; name: string } | null>(null);
  const [lastReadSnapshot, setLastReadSnapshot] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Contact list with infinite scroll
  const {
    data: contactsData,
    isLoading: contactsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['conversations', searchQuery],
    queryFn: ({ pageParam }) =>
      conversationsApi.list({ search: searchQuery || undefined, page: pageParam, limit: 30 }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const p = lastPage.pagination;
      if (!p || p.page >= p.totalPages) return undefined;
      return p.page + 1;
    },
    refetchInterval: searchQuery ? false : 10000,
  });

  const conversations: Conversation[] = contactsData?.pages.flatMap((p) => p.data || []) || [];

  // IntersectionObserver to trigger loading next page
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Messages for selected lead
  const { data: messagesData, isError: messagesError } = useQuery({
    queryKey: ['conversation-messages', selectedLeadId],
    queryFn: () => conversationsApi.getMessages(selectedLeadId!, { limit: 100 }),
    enabled: !!selectedLeadId,
    refetchInterval: 5000,
  });

  const lead = messagesData?.data?.lead;
  const messages: MessageLogEntry[] = messagesData?.data?.messages || [];

  // Send text message
  const sendTextMutation = useMutation({
    mutationFn: (text: string) => conversationsApi.sendText(selectedLeadId!, text),
    onSuccess: () => {
      setMessageText('');
      queryClient.invalidateQueries({ queryKey: ['conversation-messages', selectedLeadId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  // Delete conversation
  const deleteMutation = useMutation({
    mutationFn: (leadId: string) => conversationsApi.delete(leadId),
    onSuccess: (_data, deletedLeadId) => {
      if (selectedLeadId === deletedLeadId) setSelectedLeadId(null);
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  // Send template message
  const sendTemplateMutation = useMutation({
    mutationFn: ({ templateId, headerMediaUrl }: { templateId: string; headerMediaUrl?: string }) =>
      conversationsApi.sendTemplate(selectedLeadId!, templateId, [], headerMediaUrl),
    onSuccess: () => {
      setShowTemplateModal(false);
      queryClient.invalidateQueries({ queryKey: ['conversation-messages', selectedLeadId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  // Send media message
  const sendMediaMutation = useMutation({
    mutationFn: ({ file, caption }: { file: File; caption?: string }) =>
      conversationsApi.sendMedia(selectedLeadId!, file, caption),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-messages', selectedLeadId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      alert('File is too large. Maximum size is 16 MB.');
      return;
    }
    sendMediaMutation.mutate({ file });
    e.target.value = '';
  };

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = messageText.trim();
    if (!trimmed || sendTextMutation.isPending) return;
    sendTextMutation.mutate(trimmed);
  };

  const selectContact = useCallback((leadId: string) => {
    const lastRead = getLastRead();
    setLastReadSnapshot(lastRead[leadId] || null);
    markAsRead(leadId);
    setSelectedLeadId(leadId);
    setMessageText('');
  }, []);

  // Find the index to insert "NEW MESSAGES" divider
  const newMessagesDividerIndex = (() => {
    if (!lastReadSnapshot || messages.length === 0) return -1;
    const lastReadTime = new Date(lastReadSnapshot).getTime();
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.direction === 'INBOUND' && new Date(msg.createdAt).getTime() > lastReadTime) {
        return i;
      }
    }
    return -1;
  })();

  return (
    <div className="h-[calc(100dvh-4rem)] lg:h-[calc(100vh-7rem)] -m-6 flex bg-gray-100 overflow-hidden">
      {/* ─── Left Panel: Contact List ─── */}
      <div
        className={`w-full md:w-80 lg:w-96 bg-white border-r flex flex-col flex-shrink-0 ${
          selectedLeadId ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Mobile Page Title + Search */}
        <div className="border-b flex-shrink-0">
          <div className="px-4 pt-4 pb-1 md:hidden">
            <h1 className="text-xl font-bold text-gray-900">Conversations</h1>
          </div>
          <div className="px-4 py-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search contacts..."
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-gray-100 rounded-xl border-0 focus:ring-2 focus:ring-primary-500 focus:bg-white transition-colors"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Contact List */}
        <div className="flex-1 overflow-y-auto">
          {contactsLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary-600" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                <MessageSquare size={24} className="text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-600">
                {searchQuery ? 'No contacts found' : 'No conversations yet'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {searchQuery ? 'Try a different search' : 'Send a campaign to start messaging'}
              </p>
            </div>
          ) : (
            <>
              {conversations.map((conv) => {
                const unread = isUnread(conv);
                return (
                  <button
                    key={conv.leadId}
                    onClick={() => selectContact(conv.leadId)}
                    className={`w-full flex items-center gap-3.5 px-4 py-3.5 text-left transition-colors active:bg-gray-100 ${
                      selectedLeadId === conv.leadId
                        ? 'bg-primary-50'
                        : unread
                          ? 'bg-green-50/40'
                          : 'hover:bg-gray-50'
                    }`}
                  >
                    <Avatar name={conv.name} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-[15px] truncate ${unread ? 'font-bold text-gray-900' : 'font-medium text-gray-900'}`}>
                          {conv.name}
                        </p>
                        {conv.lastMessage && (
                          <span className={`text-[11px] flex-shrink-0 ${unread ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>
                            {formatTime(conv.lastMessage.createdAt)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        {conv.lastMessage?.direction === 'OUTBOUND' && (
                          <StatusTick status={conv.lastMessage.status} size={13} />
                        )}
                        <p className={`text-[13px] truncate flex-1 ${unread ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>
                          {parsePreview(conv.lastMessage?.content)}
                        </p>
                        {unread && (
                          <span className="flex-shrink-0 w-2.5 h-2.5 bg-green-500 rounded-full" />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}

              {/* Infinite scroll sentinel */}
              <div ref={loadMoreRef} className="py-4 flex justify-center">
                {isFetchingNextPage ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600" />
                ) : hasNextPage ? (
                  <button
                    onClick={() => fetchNextPage()}
                    className="text-xs text-primary-600 hover:underline flex items-center gap-1"
                  >
                    <ChevronDown size={14} /> Load more
                  </button>
                ) : conversations.length > 0 ? (
                  <span className="text-xs text-gray-400">All conversations loaded</span>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── Right Panel: Chat Thread ─── */}
      <div
        className={`min-w-0 flex flex-col bg-[#e5ddd5] ${
          selectedLeadId
            ? 'fixed inset-x-0 top-16 bottom-0 z-20 md:relative md:inset-auto md:z-auto md:flex-1'
            : 'hidden md:flex md:flex-1'
        }`}
      >
        {!selectedLeadId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-500 px-6">
              <div className="w-20 h-20 bg-gray-200/80 rounded-full flex items-center justify-center mx-auto mb-4">
                <Send size={28} className="text-gray-400" />
              </div>
              <p className="text-lg font-medium">Select a conversation</p>
              <p className="text-sm mt-1">Choose a contact to view messages</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="bg-white px-2 md:px-4 py-2 md:py-2.5 border-b flex items-center gap-2 md:gap-3 shadow-sm flex-shrink-0">
              <button
                onClick={() => setSelectedLeadId(null)}
                className="md:hidden p-2 text-gray-600 rounded-full active:bg-gray-100"
              >
                <ArrowLeft size={22} />
              </button>
              <Avatar name={lead?.name || ''} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-[15px] leading-tight truncate">{lead?.name}</p>
                <p className="text-[11px] md:text-xs text-gray-500 truncate mt-0.5">
                  {lead?.phone}
                  {lead?.businessName && ` · ${lead.businessName}`}
                  {lead?.city && ` · ${lead.city}`}
                </p>
              </div>
              <button
                onClick={() => setDeleteTarget({ leadId: selectedLeadId!, name: lead?.name || 'this contact' })}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                title="Delete conversation"
              >
                <Trash2 size={18} />
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 md:px-4 py-3 space-y-1">
              {messagesError ? (
                <div className="text-center py-10">
                  <p className="text-sm text-red-600 bg-white/80 rounded-lg inline-block px-4 py-2">
                    Failed to load messages. Retrying...
                  </p>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm text-gray-600 bg-white/80 rounded-lg inline-block px-4 py-2">
                    No messages yet. Send a template to start the conversation.
                  </p>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div key={msg.id}>
                    {idx === newMessagesDividerIndex && (
                      <div className="flex items-center gap-3 py-2 my-1">
                        <div className="flex-1 h-px bg-[#f9a825]" />
                        <span className="text-[11px] font-medium text-[#f9a825] bg-white/90 px-3 py-1 rounded-full shadow-sm uppercase tracking-wide">
                          New Messages
                        </span>
                        <div className="flex-1 h-px bg-[#f9a825]" />
                      </div>
                    )}
                    <ChatBubble
                      message={msg}
                      isNew={newMessagesDividerIndex >= 0 && idx >= newMessagesDividerIndex && msg.direction === 'INBOUND'}
                    />
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="bg-white px-2 md:px-4 py-2 md:py-3 border-t flex-shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              {lead?.optedOut ? (
                <div className="text-center text-sm text-orange-600 py-2">
                  This contact has opted out of messages
                </div>
              ) : (
                <form onSubmit={handleSendText} className="flex items-center gap-1 md:gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTemplateModal(true)}
                    className="p-2.5 text-gray-500 hover:text-primary-600 active:bg-gray-100 rounded-full flex-shrink-0"
                    title="Send template message"
                  >
                    <FileText size={22} />
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sendMediaMutation.isPending}
                    className="p-2.5 text-gray-500 hover:text-primary-600 active:bg-gray-100 rounded-full flex-shrink-0 disabled:opacity-50"
                    title="Attach file or photo"
                  >
                    <Paperclip size={22} />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*,.pdf,.doc,.docx"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <input
                    type="text"
                    placeholder="Type a message..."
                    className="flex-1 min-w-0 py-2.5 px-4 bg-gray-100 rounded-full text-[15px] md:text-sm border-0 focus:ring-2 focus:ring-primary-500 focus:bg-white"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={!messageText.trim() || sendTextMutation.isPending}
                    className="p-2.5 text-white bg-primary-600 hover:bg-primary-700 rounded-full disabled:opacity-50 active:bg-primary-800 flex-shrink-0"
                  >
                    <Send size={20} />
                  </button>
                </form>
              )}
              {sendMediaMutation.isPending && (
                <div className="text-xs text-gray-500 mt-1.5 text-center flex items-center justify-center gap-1.5">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-600" />
                  Sending file...
                </div>
              )}
              {(sendTextMutation.isError || sendMediaMutation.isError) && (
                <p className="text-xs text-red-500 mt-1.5 text-center">
                  {(sendTextMutation.error as any)?.response?.data?.error ||
                   (sendMediaMutation.error as any)?.response?.data?.error ||
                   'Failed to send message'}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Delete Confirmation — bottom sheet on mobile */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50">
          <div className="bg-white w-full md:max-w-sm md:rounded-xl rounded-t-2xl shadow-xl p-5 md:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <h3 className="font-semibold text-gray-900 text-lg">Delete conversation?</h3>
            <p className="text-sm text-gray-500 mt-2">
              This will permanently delete all messages with{' '}
              <span className="font-medium text-gray-700">{deleteTarget.name}</span>.
              This action cannot be undone.
            </p>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-3 md:py-2.5 text-sm font-medium border rounded-xl hover:bg-gray-50 active:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.leadId)}
                disabled={deleteMutation.isPending}
                className="flex-1 px-4 py-3 md:py-2.5 text-sm font-medium bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 active:bg-red-800"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
            {deleteMutation.isError && (
              <p className="text-xs text-red-500 mt-2 text-center">
                Failed to delete. Please try again.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Template Selector — bottom sheet on mobile */}
      {showTemplateModal && selectedLeadId && (
        <TemplateModal
          onSelect={(templateId, headerMediaUrl) => sendTemplateMutation.mutate({ templateId, headerMediaUrl })}
          onClose={() => setShowTemplateModal(false)}
          isSending={sendTemplateMutation.isPending}
        />
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const sizeClasses = size === 'sm'
    ? 'w-9 h-9 text-xs'
    : 'w-11 h-11 text-sm';

  return (
    <div className={`${sizeClasses} rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-semibold flex-shrink-0`}>
      {initials || <User size={size === 'sm' ? 14 : 16} />}
    </div>
  );
}

function ChatBubble({ message, isNew }: { message: MessageLogEntry; isNew?: boolean }) {
  const isOutbound = message.direction === 'OUTBOUND';

  let textContent = message.content || message.template?.bodyText || '[Message]';
  let mediaUrl: string | undefined;
  let mediaType: string | undefined;

  let filename: string | undefined;
  if (message.content && message.content.startsWith('{')) {
    try {
      const parsed = JSON.parse(message.content);
      textContent = parsed.text || message.template?.bodyText || '[Message]';
      mediaUrl = parsed.mediaUrl;
      mediaType = parsed.mediaType;
      filename = parsed.filename;
    } catch { /* not JSON, use as-is */ }
  }

  if (!mediaUrl && message.template?.headerType === 'VIDEO') {
    mediaType = 'VIDEO';
  } else if (!mediaUrl && message.template?.headerType === 'IMAGE') {
    mediaType = 'IMAGE';
  }

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-xl px-3 py-2 text-[15px] sm:text-sm shadow-sm ${
          isOutbound
            ? 'bg-[#dcf8c6] text-gray-900 rounded-tr-sm'
            : isNew
              ? 'bg-[#f0f9e8] text-gray-900 rounded-tl-sm ring-1 ring-green-200'
              : 'bg-white text-gray-900 rounded-tl-sm'
        }`}
      >
        {mediaUrl && mediaType === 'VIDEO' ? (
          <video src={mediaUrl} controls className="rounded-lg mb-2 max-w-full" style={{ maxHeight: 240 }} />
        ) : mediaUrl && mediaType === 'IMAGE' ? (
          <img src={mediaUrl} alt="" className="rounded-lg mb-2 max-w-full" style={{ maxHeight: 240 }} />
        ) : mediaType === 'VIDEO' ? (
          <div className="flex items-center gap-2 bg-black/10 rounded-lg px-3 py-2 mb-2">
            <Play size={16} className="text-gray-600" />
            <span className="text-xs text-gray-600">{filename || 'Video message'}</span>
          </div>
        ) : mediaType === 'IMAGE' ? (
          <div className="flex items-center gap-2 bg-black/10 rounded-lg px-3 py-2 mb-2">
            <Image size={16} className="text-gray-600" />
            <span className="text-xs text-gray-600">{filename || 'Image message'}</span>
          </div>
        ) : mediaType === 'DOCUMENT' ? (
          <div className="flex items-center gap-2 bg-black/10 rounded-lg px-3 py-2 mb-2">
            <FileText size={16} className="text-gray-600" />
            <span className="text-xs text-gray-600">{filename || 'Document'}</span>
          </div>
        ) : mediaType === 'AUDIO' ? (
          <div className="flex items-center gap-2 bg-black/10 rounded-lg px-3 py-2 mb-2">
            <Mic size={16} className="text-gray-600" />
            <span className="text-xs text-gray-600">Voice message</span>
          </div>
        ) : null}
        <p className="whitespace-pre-wrap break-words overflow-hidden">{textContent}</p>
        <div className={`flex items-center gap-1 mt-1 ${isOutbound ? 'justify-end' : ''}`}>
          <span className="text-[10px] text-gray-500">
            {formatTime(message.sentAt || message.createdAt)}
          </span>
          {isOutbound && <StatusTick status={message.status} size={14} />}
        </div>
        {message.status === 'FAILED' && message.errorMessage && (
          <p className="text-[10px] text-red-500 mt-1">{message.errorMessage}</p>
        )}
      </div>
    </div>
  );
}

function StatusTick({ status, size = 14 }: { status: MessageStatus; size?: number }) {
  switch (status) {
    case 'PENDING':
    case 'QUEUED':
      return <Clock size={size} className="text-gray-400" />;
    case 'SENT':
      return <Check size={size} className="text-gray-400" />;
    case 'DELIVERED':
      return <CheckCheck size={size} className="text-gray-400" />;
    case 'READ':
      return <CheckCheck size={size} className="text-blue-500" />;
    case 'FAILED':
      return <AlertCircle size={size} className="text-red-500" />;
    default:
      return null;
  }
}

function TemplateModal({
  onSelect,
  onClose,
  isSending,
}: {
  onSelect: (templateId: string, headerMediaUrl?: string) => void;
  onClose: () => void;
  isSending: boolean;
}) {
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
  const [mediaUrl, setMediaUrl] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => templatesApi.list(),
  });

  const templates: MessageTemplate[] = (data?.data || []).filter(
    (t) => t.status === 'APPROVED'
  );

  const needsMedia = selectedTemplate?.headerType === 'IMAGE' || selectedTemplate?.headerType === 'VIDEO';

  const handleSend = () => {
    if (!selectedTemplate) return;
    onSelect(selectedTemplate.id, needsMedia ? mediaUrl || undefined : undefined);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50">
      <div className="bg-white w-full md:max-w-md md:rounded-xl rounded-t-2xl shadow-xl max-h-[85dvh] md:max-h-[70vh] flex flex-col pb-[env(safe-area-inset-bottom,0px)]">
        <div className="flex items-center justify-between px-4 py-3.5 border-b flex-shrink-0">
          {/* Drag handle indicator on mobile */}
          <div className="absolute left-1/2 -translate-x-1/2 top-2 w-10 h-1 bg-gray-300 rounded-full md:hidden" />
          <h3 className="font-semibold text-gray-900 text-base">
            {selectedTemplate ? 'Confirm & Send' : 'Send Template'}
          </h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full active:bg-gray-100">
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
            </div>
          ) : selectedTemplate ? (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl border bg-gray-50">
                <p className="font-medium text-sm text-gray-900">{selectedTemplate.name}</p>
                <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{selectedTemplate.bodyText || selectedTemplate.content}</p>
              </div>

              {needsMedia && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {selectedTemplate.headerType === 'VIDEO' ? 'Video' : 'Image'} URL (required)
                  </label>
                  <input
                    type="url"
                    placeholder={`https://example.com/media.${selectedTemplate.headerType === 'VIDEO' ? 'mp4' : 'jpg'}`}
                    className="w-full px-3.5 py-2.5 text-sm border rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                  />
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setSelectedTemplate(null); setMediaUrl(''); }}
                  className="flex-1 px-3 py-3 md:py-2.5 text-sm font-medium border rounded-xl hover:bg-gray-50 active:bg-gray-100"
                >
                  Back
                </button>
                <button
                  onClick={handleSend}
                  disabled={isSending || (needsMedia && !mediaUrl)}
                  className="flex-1 px-3 py-3 md:py-2.5 text-sm font-medium bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 active:bg-primary-800"
                >
                  {isSending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10">
              <FileText size={32} className="text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">No approved templates available</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplate(template)}
                  className="w-full text-left p-3.5 rounded-xl border hover:border-primary-300 hover:bg-primary-50 transition-colors active:bg-primary-100"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-[15px] sm:text-sm text-gray-900">{template.name}</p>
                    <span className="text-xs text-gray-400 uppercase ml-2">{template.language}</span>
                  </div>
                  <p className="text-[13px] sm:text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                    {template.bodyText || template.content}
                  </p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {template.category}
                    </span>
                    {(template.headerType === 'VIDEO' || template.headerType === 'IMAGE') && (
                      <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">
                        {template.headerType}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Helpers ─── */

function parsePreview(content?: string): string {
  if (!content) return 'Template message';
  if (content.startsWith('{')) {
    try {
      const parsed = JSON.parse(content);
      return parsed.text || 'Template message';
    } catch { /* not JSON */ }
  }
  return content;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) {
    return 'Yesterday';
  }
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
