"use client"

import type React from "react"
import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { MessageCircle, Send, Moon, Sun, Crown, Reply, X, Heart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

type Message = {
  id: string
  content: string
  created_at: string
  reply_to: string | null
}

type Theme = "dark" | "light" | "golden" | "sonali"

export default function AnonymousChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [theme, setTheme] = useState<Theme>("dark")
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [showTooltip, setShowTooltip] = useState(false)
  const supabase = createClient()

  const removeExpiredMessages = useCallback(() => {
    const now = new Date()
    setMessages((current) =>
      current.filter((msg) => {
        const messageTime = new Date(msg.created_at)
        const diffMinutes = (now.getTime() - messageTime.getTime()) / 1000 / 60
        return diffMinutes < 2
      }),
    )
  }, [])

  const cleanupDatabase = useCallback(async () => {
    try {
      const { error } = await supabase.rpc("delete_old_messages")
      if (error) console.error("[v0] Error cleaning database:", error)
    } catch (err) {
      console.error("[v0] Database cleanup failed:", err)
    }
  }, [supabase])

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as Theme
    if (savedTheme) {
      setTheme(savedTheme)
      document.documentElement.setAttribute("data-theme", savedTheme)
    } else {
      document.documentElement.setAttribute("data-theme", "dark")
    }

    fetchMessages()

    const channel = supabase
      .channel("messages", {
        config: {
          broadcast: { self: true },
          presence: { key: "" },
        },
      })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          console.log("[v0] New message received:", payload.new)
          setMessages((current) => {
            if (current.some((msg) => msg.id === payload.new.id)) {
              return current
            }
            return [payload.new as Message, ...current]
          })
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          console.log("[v0] Message deleted:", payload.old.id)
          setMessages((current) => current.filter((msg) => msg.id !== payload.old.id))
        },
      )
      .subscribe()

    const expirationInterval = setInterval(removeExpiredMessages, 10000)

    const cleanupInterval = setInterval(cleanupDatabase, 30000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(expirationInterval)
      clearInterval(cleanupInterval)
    }
  }, [removeExpiredMessages, cleanupDatabase, supabase])

  const fetchMessages = async () => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .gte("created_at", twoMinutesAgo)
      .order("created_at", { ascending: false })
      .limit(100)

    if (data && !error) {
      setMessages(data)
    } else if (error) {
      console.error("[v0] Error fetching messages:", error)
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || isLoading) return

    setIsLoading(true)
    const messageContent = newMessage.trim()

    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      content: messageContent,
      created_at: new Date().toISOString(),
      reply_to: replyingTo?.id || null,
    }

    setNewMessage("")
    const currentReplyTo = replyingTo
    setReplyingTo(null)
    setMessages((current) => [optimisticMessage, ...current])

    const { data, error } = await supabase
      .from("messages")
      .insert({
        content: messageContent,
        reply_to: currentReplyTo?.id || null,
      })
      .select()
      .single()

    if (error) {
      console.error("[v0] Error sending message:", error)
      setMessages((current) => current.filter((msg) => msg.id !== optimisticMessage.id))
      setNewMessage(messageContent)
      setReplyingTo(currentReplyTo)
    } else if (data) {
      setMessages((current) => current.map((msg) => (msg.id === optimisticMessage.id ? data : msg)))
    }

    setIsLoading(false)
  }

  const toggleTheme = () => {
    const themes: Theme[] = ["dark", "light", "golden", "sonali"]
    const currentIndex = themes.indexOf(theme)
    const nextTheme = themes[(currentIndex + 1) % themes.length]
    setTheme(nextTheme)
    document.documentElement.setAttribute("data-theme", nextTheme)
    localStorage.setItem("theme", nextTheme)
  }

  const getThemeName = () => {
    switch (theme) {
      case "dark":
        return "Dark Mode"
      case "light":
        return "Light Mode"
      case "golden":
        return "Golden Mode"
      case "sonali":
        return "Sonali Mode"
      default:
        return "Dark Mode"
    }
  }

  const getThemeIcon = () => {
    switch (theme) {
      case "light":
        return <Sun className="h-5 w-5" />
      case "golden":
        return <Crown className="h-5 w-5" />
      case "sonali":
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M12 12c-2-2-4-3-6-3s-4 1-4 3c0 1.5 1.5 2.5 3 2.5s3-1 3-2.5" />
            <path d="M12 12c2-2 4-3 6-3s4 1 4 3c0 1.5-1.5 2.5-3 2.5s-3-1-3-2.5" />
            <circle cx="12" cy="12" r="1" fill="currentColor" />
          </svg>
        )
      default:
        return <Moon className="h-5 w-5" />
    }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)

    if (minutes >= 2) return "expiring..."
    if (minutes > 0) return `${minutes}m ago`
    if (seconds > 0) return `${seconds}s ago`
    return "just now"
  }

  const getRepliedMessage = (replyToId: string | null) => {
    if (!replyToId) return null
    return messages.find((msg) => msg.id === replyToId)
  }

  return (
    <div className="flex min-h-screen flex-col bg-background transition-colors duration-300">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <MessageCircle className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Anonymous Chat</h1>
              <p className="text-xs text-muted-foreground">Messages disappear after 2 minutes</p>
            </div>
          </div>
          <div className="relative">
            <Button
              variant="outline"
              size="icon"
              onClick={toggleTheme}
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              className="rounded-full transition-all hover:rotate-12 bg-transparent"
            >
              {getThemeIcon()}
            </Button>
            {showTooltip && (
              <div className="absolute right-0 top-full mt-2 whitespace-nowrap rounded-lg bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-lg border border-border animate-in fade-in zoom-in-95 duration-200">
                {getThemeName()}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto flex-1 overflow-auto px-4 py-6">
        <div className="mx-auto max-w-4xl space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                <MessageCircle className="h-10 w-10 text-muted-foreground" />
              </div>
              <h2 className="mb-2 text-2xl font-semibold">No messages yet</h2>
              <p className="text-muted-foreground">Be the first to start the conversation</p>
            </div>
          ) : (
            messages.map((message) => {
              const repliedMessage = getRepliedMessage(message.reply_to)
              return (
                <div
                  key={message.id}
                  className="group animate-in fade-in slide-in-from-bottom-2 duration-500 rounded-lg border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10 ring-2 ring-primary/20">
                      <MessageCircle className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Anonymous</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground/70">{formatTime(message.created_at)}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={() => setReplyingTo(message)}
                          >
                            <Reply className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      {repliedMessage && (
                        <div className="my-2 rounded border-l-2 border-primary/50 bg-muted/50 px-3 py-2">
                          <p className="text-xs text-muted-foreground">Replying to:</p>
                          <p className="text-sm text-foreground/80 line-clamp-2">{repliedMessage.content}</p>
                        </div>
                      )}
                      <p className="text-pretty leading-relaxed text-foreground">{message.content}</p>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </main>

      <footer className="border-t border-border bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <form onSubmit={handleSendMessage} className="mx-auto max-w-4xl">
            {replyingTo && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-primary/50 bg-primary/5 px-3 py-2">
                <Reply className="h-4 w-4 text-primary" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Replying to:</p>
                  <p className="text-sm line-clamp-1">{replyingTo.content}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => setReplyingTo(null)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            <div className="flex gap-3">
              <Textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your anonymous message..."
                className="min-h-[60px] resize-none bg-background transition-all focus:ring-2 focus:ring-primary"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage(e)
                  }
                }}
                disabled={isLoading}
              />
              <Button
                type="submit"
                size="icon"
                className="h-[60px] w-[60px] shrink-0 rounded-xl transition-all hover:scale-105"
                disabled={isLoading || !newMessage.trim()}
              >
                {theme === "sonali" ? <Heart className="h-5 w-5" /> : <Send className="h-5 w-5" />}
              </Button>
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Press Enter to send • Shift+Enter for new line
            </p>
          </form>
        </div>
      </footer>
    </div>
  )
}
