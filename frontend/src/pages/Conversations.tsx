import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, ArrowLeft, Send, Clock, Check, CheckCheck, AlertCircle,
  FileText, X, User, Play, Image, Trash2,
} from 'lucide-react';
import { conversationsApi, templatesApi } from '../services/api';
import type { Conversation, MessageLogEntry, MessageStatus, MessageTemplate } from '../types';

export default function Conversations() {
  const queryClient = useQueryClient();
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageText, setMessageText] = useState('');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ leadId: string; name: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Contact list — disable auto-refetch during active search
  const { data: contactsData, isLoading: contactsLoading } = useQuery({
    queryKey: ['conversations', searchQuery],
    queryFn: () => conversationsApi.list({ search: searchQuery || undefined }),
    refetchInterval: searchQuery ? false : 10000,
  });

  const conversations: Conversation[] = contactsData?.data || [];

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
      queryClient.invalidateQueries({ queryKey: ['conversations', searchQuery], exact: true });
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
      queryClient.invalidateQueries({ queryKey: ['conversations', searchQuery], exact: true });
    },
  });

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

  const selectContact = (leadId: string) => {
    setSelectedLeadId(leadId);
    setMessageText('');
  };

  return (
    <div className="h-[calc(100vh-7rem)] -m-6 flex bg-gray-100 overflow-hidden">
      {/* Left Panel: Contact List */}
      <div
        className={`w-full md:w-80 lg:w-96 bg-white border-r flex flex-col flex-shrink-0 ${
          selectedLeadId ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Search Header */}
        <div className="p-3 border-b">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search contacts..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-gray-100 rounded-lg border-0 focus:ring-2 focus:ring-primary-500 focus:bg-white"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Contact List */}
        <div className="flex-1 overflow-y-auto">
          {contactsLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm">
              {searchQuery ? 'No contacts found' : 'No conversations yet'}
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.leadId}
                className={`group w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-50 transition-colors ${
                  selectedLeadId === conv.leadId ? 'bg-primary-50' : ''
                }`}
              >
                <button
                  onClick={() => selectContact(conv.leadId)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <Avatar name={conv.name} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-gray-900 text-sm truncate">{conv.name}</p>
                      {conv.lastMessage && (
                        <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                          {formatTime(conv.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {conv.lastMessage?.direction === 'OUTBOUND' && (
                        <StatusTick status={conv.lastMessage.status} size={12} />
                      )}
                      <p className="text-xs text-gray-500 truncate">
                        {parsePreview(conv.lastMessage?.content)}
                      </p>
                    </div>
                  </div>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget({ leadId: conv.leadId, name: conv.name });
                  }}
                  className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                  title="Delete conversation"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Panel: Chat Thread */}
      <div
        className={`flex-1 min-w-0 flex flex-col bg-[#e5ddd5] ${
          selectedLeadId ? 'flex' : 'hidden md:flex'
        }`}
      >
        {!selectedLeadId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                <Send size={24} className="text-gray-400" />
              </div>
              <p className="text-lg font-medium">Select a conversation</p>
              <p className="text-sm mt-1">Choose a contact to view messages</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="bg-white px-4 py-3 border-b flex items-center gap-3">
              <button
                onClick={() => setSelectedLeadId(null)}
                className="md:hidden p-1 text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft size={20} />
              </button>
              <Avatar name={lead?.name || ''} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm truncate">{lead?.name}</p>
                <p className="text-xs text-gray-500 truncate">
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
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3 space-y-1">
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
                messages.map((msg) => (
                  <ChatBubble key={msg.id} message={msg} />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="bg-white px-4 py-3 border-t">
              {lead?.optedOut ? (
                <div className="text-center text-sm text-orange-600 py-2">
                  This contact has opted out of messages
                </div>
              ) : (
                <form onSubmit={handleSendText} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTemplateModal(true)}
                    className="p-2 text-gray-500 hover:text-primary-600 hover:bg-gray-100 rounded-full"
                    title="Send template message"
                  >
                    <FileText size={20} />
                  </button>
                  <input
                    type="text"
                    placeholder="Type a message..."
                    className="flex-1 py-2 px-4 bg-gray-100 rounded-full text-sm border-0 focus:ring-2 focus:ring-primary-500 focus:bg-white"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={!messageText.trim() || sendTextMutation.isPending}
                    className="p-2 text-white bg-primary-600 hover:bg-primary-700 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send size={18} />
                  </button>
                </form>
              )}
              {sendTextMutation.isError && (
                <p className="text-xs text-red-500 mt-1 text-center">
                  {(sendTextMutation.error as any)?.response?.data?.error || 'Failed to send message'}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold text-gray-900 text-lg">Delete conversation?</h3>
            <p className="text-sm text-gray-500 mt-2">
              This will permanently delete all messages with{' '}
              <span className="font-medium text-gray-700">{deleteTarget.name}</span>.
              This action cannot be undone.
            </p>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.leadId)}
                disabled={deleteMutation.isPending}
                className="flex-1 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
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

      {/* Template Selector Modal */}
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

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-semibold text-sm flex-shrink-0">
      {initials || <User size={16} />}
    </div>
  );
}

function ChatBubble({ message }: { message: MessageLogEntry }) {
  const isOutbound = message.direction === 'OUTBOUND';

  // Parse content that may contain JSON with media info
  let textContent = message.content || message.template?.bodyText || '[Message]';
  let mediaUrl: string | undefined;
  let mediaType: string | undefined;

  if (message.content && message.content.startsWith('{')) {
    try {
      const parsed = JSON.parse(message.content);
      textContent = parsed.text || message.template?.bodyText || '[Message]';
      mediaUrl = parsed.mediaUrl;
      mediaType = parsed.mediaType;
    } catch { /* not JSON, use as-is */ }
  }

  // Also check template headerType for older messages without JSON content
  if (!mediaUrl && message.template?.headerType === 'VIDEO') {
    mediaType = 'VIDEO';
  } else if (!mediaUrl && message.template?.headerType === 'IMAGE') {
    mediaType = 'IMAGE';
  }

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm ${
          isOutbound
            ? 'bg-[#dcf8c6] text-gray-900 rounded-tr-none'
            : 'bg-white text-gray-900 rounded-tl-none'
        }`}
      >
        {mediaUrl && mediaType === 'VIDEO' ? (
          <video src={mediaUrl} controls className="rounded-md mb-2 max-w-full" style={{ maxHeight: 240 }} />
        ) : mediaUrl && mediaType === 'IMAGE' ? (
          <img src={mediaUrl} alt="" className="rounded-md mb-2 max-w-full" style={{ maxHeight: 240 }} />
        ) : mediaType === 'VIDEO' ? (
          <div className="flex items-center gap-2 bg-black/10 rounded-md px-3 py-2 mb-2">
            <Play size={16} className="text-gray-600" />
            <span className="text-xs text-gray-600">Video message</span>
          </div>
        ) : mediaType === 'IMAGE' ? (
          <div className="flex items-center gap-2 bg-black/10 rounded-md px-3 py-2 mb-2">
            <Image size={16} className="text-gray-600" />
            <span className="text-xs text-gray-600">Image message</span>
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-gray-900">
            {selectedTemplate ? 'Confirm & Send' : 'Send Template'}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
            </div>
          ) : selectedTemplate ? (
            <div className="space-y-3">
              <div className="p-3 rounded-lg border bg-gray-50">
                <p className="font-medium text-sm text-gray-900">{selectedTemplate.name}</p>
                <p className="text-xs text-gray-500 mt-1">{selectedTemplate.bodyText || selectedTemplate.content}</p>
              </div>

              {needsMedia && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {selectedTemplate.headerType === 'VIDEO' ? 'Video' : 'Image'} URL (required)
                  </label>
                  <input
                    type="url"
                    placeholder={`https://example.com/media.${selectedTemplate.headerType === 'VIDEO' ? 'mp4' : 'jpg'}`}
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                  />
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => { setSelectedTemplate(null); setMediaUrl(''); }}
                  className="flex-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={handleSend}
                  disabled={isSending || (needsMedia && !mediaUrl)}
                  className="flex-1 px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {isSending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          ) : templates.length === 0 ? (
            <p className="text-center text-gray-500 py-8 text-sm">
              No approved templates available
            </p>
          ) : (
            <div className="space-y-2">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplate(template)}
                  className="w-full text-left p-3 rounded-lg border hover:border-primary-300 hover:bg-primary-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm text-gray-900">{template.name}</p>
                    <span className="text-xs text-gray-400 uppercase">{template.language}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                    {template.bodyText || template.content}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {template.category}
                    </span>
                    {(template.headerType === 'VIDEO' || template.headerType === 'IMAGE') && (
                      <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded">
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
