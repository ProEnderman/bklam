import type { QrMenuCategory } from '../../api/qrTypes'

export const mockMenu: QrMenuCategory[] = [
  {
    id: 1,
    name: 'Hot Dishes',
    imageUrl: null as any,
    dishes: [
      { id: 8, name: 'Steak', price: 1500, imageUrl: undefined },
      { id: 9, name: 'Fillet', price: 1200, imageUrl: undefined },
    ],
  },
  {
    id: 2,
    name: 'Salads',
    imageUrl: null as any,
    dishes: [
      { id: 10, name: 'Caesar Salad', price: 450, imageUrl: undefined },
    ],
  },
]
