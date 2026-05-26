import { Request, Response } from "express"
import { supabase } from "../config/supabase"
import { io } from "../server"

async function getOrCreateWallet(userId: string) {
  const { data: existingWallet } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  if (existingWallet) return existingWallet

  const { data, error } = await supabase
    .from("wallets")
    .insert({
      user_id: userId,
      balance: 0,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)

  return data
}

export async function getMyWallet(req: Request, res: Response) {
  try {
    const userId = req.user.id

    const wallet = await getOrCreateWallet(userId)

    const { data: transactions } = await supabase
      .from("point_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50)

    return res.json({
      wallet,
      transactions: transactions || [],
    })
  } catch (error: any) {
    return res.status(500).json({
      message: error.message,
    })
  }
}

export async function topUpDemo(req: Request, res: Response) {
  try {
    const userId = req.user.id
    const { amount } = req.body

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        message: "Amount point tidak valid",
      })
    }

    const wallet = await getOrCreateWallet(userId)
    const newBalance = wallet.balance + Number(amount)

    const { data: updatedWallet, error } = await supabase
      .from("wallets")
      .update({
        balance: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .select()
      .single()

    if (error) return res.status(400).json({ message: error.message })

    await supabase.from("point_transactions").insert({
      user_id: userId,
      type: "topup_demo",
      amount: Number(amount),
      description: `Top up demo ${amount} points`,
    })

    return res.json({
      message: "Top up demo berhasil",
      wallet: updatedWallet,
    })
  } catch (error: any) {
    return res.status(500).json({
      message: error.message,
    })
  }
}

export async function giftPoints(req: Request, res: Response) {
  const senderId = req.user.id

  const {
    target_email,
    target_user_id,
    amount,
    message,
  } = req.body

  const giftAmount = Number(amount)

  if (!giftAmount || giftAmount <= 0) {
    return res.status(400).json({
      message: "Jumlah point tidak valid",
    })
  }

  let targetUserId = target_user_id || null

  if (target_email) {
    const cleanEmail = String(target_email).trim().toLowerCase()

    const { data: targetUser, error: targetError } = await supabase
      .from("users")
      .select("id, email")
      .ilike("email", cleanEmail)
      .maybeSingle()

    if (targetError) {
      return res.status(400).json({
        message: targetError.message,
      })
    }

    if (!targetUser) {
      return res.status(404).json({
        message: "User dengan email tersebut tidak ditemukan",
      })
    }

    targetUserId = targetUser.id
  }

  if (!targetUserId) {
    return res.status(400).json({
      message: "target_email atau target_user_id wajib diisi",
    })
  }

  if (targetUserId === senderId) {
    return res.status(400).json({
      message: "Tidak bisa gift point ke akun sendiri",
    })
  }

  const { data: senderWallet, error: senderWalletError } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", senderId)
    .single()

  if (senderWalletError || !senderWallet) {
    return res.status(404).json({
      message: "Wallet pengirim tidak ditemukan",
    })
  }

  if (Number(senderWallet.balance) < giftAmount) {
    return res.status(400).json({
      message: "Saldo point tidak cukup",
    })
  }

  const { data: targetWallet, error: targetWalletError } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", targetUserId)
    .maybeSingle()

  if (targetWalletError) {
    return res.status(400).json({
      message: targetWalletError.message,
    })
  }

  if (!targetWallet) {
    const { error: createWalletError } = await supabase
      .from("wallets")
      .insert({
        user_id: targetUserId,
        balance: 0,
        total_topup: 0,
        total_gift_received: 0,
        total_gift_sent: 0,
      })

    if (createWalletError) {
      return res.status(400).json({
        message: createWalletError.message,
      })
    }
  }

  const { error: senderUpdateError } = await supabase
    .from("wallets")
    .update({
      balance: Number(senderWallet.balance) - giftAmount,
      total_gift_sent: Number(senderWallet.total_gift_sent || 0) + giftAmount,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", senderId)

  if (senderUpdateError) {
    return res.status(400).json({
      message: senderUpdateError.message,
    })
  }

  const { data: latestTargetWallet } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", targetUserId)
    .single()

  const { error: targetUpdateError } = await supabase
    .from("wallets")
    .update({
      balance: Number(latestTargetWallet?.balance || 0) + giftAmount,
      total_gift_received:
        Number(latestTargetWallet?.total_gift_received || 0) + giftAmount,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", targetUserId)

  if (targetUpdateError) {
    return res.status(400).json({
      message: targetUpdateError.message,
    })
  }

  const { data: transaction, error: txError } = await supabase
    .from("wallet_transactions")
    .insert({
      user_id: senderId,
      target_user_id: targetUserId,
      type: "gift",
      amount: giftAmount,
      message: message || null,
      status: "success",
    })
    .select()
    .single()

  if (txError) {
    return res.status(400).json({
      message: txError.message,
    })
  }

  return res.json({
    message: "Gift point berhasil dikirim",
    transaction,
  })
}

export async function getShopItems(req: Request, res: Response) {
  const { type } = req.query

  let query = supabase
    .from("shop_items")
    .select("*")
    .eq("is_active", true)
    .order("price", { ascending: true })

  if (type) {
    query = query.eq("type", type)
  }

  const { data, error } = await query

  if (error) return res.status(400).json({ message: error.message })

  return res.json(data)
}

export async function getWalletTransactions(req: Request, res: Response) {
  const userId = req.user.id

  const { data, error } = await supabase
    .from("wallet_transactions")
    .select("*")
    .or(`user_id.eq.${userId},target_user_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) {
    return res.status(400).json({ message: error.message })
  }

  return res.json(data || [])
}

export async function buyShopItem(req: Request, res: Response) {
  try {
    const userId = req.user.id
    const { item_id } = req.body

    if (!item_id) {
      return res.status(400).json({
        message: "item_id wajib diisi",
      })
    }

    const wallet = await getOrCreateWallet(userId)

    const { data: item, error: itemError } = await supabase
      .from("shop_items")
      .select("*")
      .eq("id", item_id)
      .eq("is_active", true)
      .single()

    if (itemError || !item) {
      return res.status(404).json({
        message: "Item tidak ditemukan",
      })
    }

    const { data: alreadyOwned } = await supabase
      .from("user_inventory")
      .select("*")
      .eq("user_id", userId)
      .eq("item_id", item_id)
      .maybeSingle()

    if (alreadyOwned) {
      return res.status(400).json({
        message: "Item sudah dimiliki",
      })
    }

    if (wallet.balance < item.price) {
      return res.status(400).json({
        message: "Saldo point tidak cukup",
      })
    }

    const newBalance = wallet.balance - item.price

    const { data: updatedWallet, error: walletError } = await supabase
      .from("wallets")
      .update({
        balance: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .select()
      .single()

    if (walletError) return res.status(400).json({ message: walletError.message })

    const { data: inventory, error: inventoryError } = await supabase
      .from("user_inventory")
      .insert({
        user_id: userId,
        item_id,
        is_equipped: false,
      })
      .select(`
        id,
        user_id,
        item_id,
        is_equipped,
        created_at,
        shop_items (*)
      `)
      .single()

    if (inventoryError) {
      return res.status(400).json({
        message: inventoryError.message,
      })
    }

    await supabase.from("point_transactions").insert({
      user_id: userId,
      type: "purchase",
      amount: -item.price,
      description: `Beli item: ${item.name}`,
    })

    return res.status(201).json({
      message: "Item berhasil dibeli",
      wallet: updatedWallet,
      inventory,
    })
  } catch (error: any) {
    return res.status(500).json({
      message: error.message,
    })
  }
}

export async function getMyInventory(req: Request, res: Response) {
  const userId = req.user.id

  const { data, error } = await supabase
    .from("user_inventory")
    .select(`
      id,
      is_equipped,
      created_at,
      shop_items (
        id,
        name,
        description,
        type,
        rarity,
        image_url,
        css_class,
        metadata
      )
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error) return res.status(400).json({ message: error.message })

  return res.json(data)
}

export async function equipItem(req: Request, res: Response) {
  const userId = req.user.id
  const { inventoryId } = req.params

  const { data: inventory, error } = await supabase
    .from("user_inventory")
    .select(`
      id,
      user_id,
      is_equipped,
      shop_items (
        id,
        type,
        name
      )
    `)
    .eq("id", inventoryId)
    .eq("user_id", userId)
    .single()

  if (error || !inventory) {
    return res.status(404).json({
      message: "Item inventory tidak ditemukan",
    })
  }

  const itemType = (inventory.shop_items as any)?.type

  if (itemType === "avatar_border") {
    await supabase
      .from("user_inventory")
      .update({ is_equipped: false })
      .eq("user_id", userId)
      .eq("shop_items.type", "avatar_border")

    const { error: updateError } = await supabase
      .from("user_inventory")
      .update({ is_equipped: true })
      .eq("id", inventoryId)

    if (updateError) {
      return res.status(400).json({ message: updateError.message })
    }

    return res.json({
      message: "Avatar border berhasil diganti",
    })
  }

  if (itemType === "badge") {
    if (!inventory.is_equipped) {
      const { count } = await supabase
        .from("user_inventory")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_equipped", true)
        .eq("shop_items.type", "badge")

      if ((count || 0) >= 5) {
        return res.status(400).json({
          message: "Maksimal hanya bisa memakai 5 badge",
        })
      }
    }

    const { error: updateError } = await supabase
      .from("user_inventory")
      .update({ is_equipped: !inventory.is_equipped })
      .eq("id", inventoryId)

    if (updateError) {
      return res.status(400).json({ message: updateError.message })
    }

    return res.json({
      message: inventory.is_equipped
        ? "Badge berhasil dilepas"
        : "Badge berhasil dipakai",
    })
  }

  return res.status(400).json({
    message: "Tipe item tidak bisa dipakai",
  })
}