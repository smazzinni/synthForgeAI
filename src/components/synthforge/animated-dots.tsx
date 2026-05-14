'use client'

import React, { useState, useEffect } from 'react'

export function AnimatedDots() {
  const [dots, setDots] = useState('.')
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '.' : prev + '.')
    }, 400)
    return () => clearInterval(interval)
  }, [])
  return <span>{dots}</span>
}
