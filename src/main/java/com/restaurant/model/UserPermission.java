package com.restaurant.model;

public enum UserPermission {
    // Заказы
    VIEW_ORDERS,           // Просмотр заказов
    VIEW_ALL_ORDERS,       // Просмотр всех заказов (не только своих)
    CREATE_ORDERS,
    EDIT_OWN_ORDERS,
    EDIT_ALL_ORDERS,
    CLOSE_OWN_ORDERS,
    CLOSE_ALL_ORDERS,
    CANCEL_OWN_ORDERS,
    CANCEL_ALL_ORDERS,
    DELETE_ORDERS,
    
    // Склад
    VIEW_INGREDIENTS,
    CREATE_INGREDIENTS,
    UPDATE_INGREDIENTS,
    DELETE_INGREDIENTS,
    STOCK_IN,
    STOCK_OUT,
    UPLOAD_EXCEL,
    VIEW_STOCK_MOVEMENTS,
    
    // Блюда
    VIEW_DISHES,
    CREATE_DISHES,
    UPDATE_DISHES,
    DELETE_DISHES,
    MANAGE_RECIPES,
    MANAGE_CATEGORIES,     // Управление категориями блюд
    
    // Бронирования
    VIEW_BOOKINGS,
    CREATE_BOOKINGS,
    EDIT_BOOKINGS,
    CANCEL_BOOKINGS,
    DELETE_BOOKINGS,       // Удаление бронирований
    VIEW_BOOKING_CALENDAR,
    
    // Тарифы и календари
    MANAGE_ACTIVITIES,
    MANAGE_TARIFFS,
    MANAGE_TARIFF_RULES,
    MANAGE_CALENDARS,
    USE_PRICING_CALCULATOR,
    
    // Смены
    VIEW_SHIFTS,           // Просмотр смен
    MANAGE_SHIFTS,
    
    // Пользователи
    VIEW_USERS,
    CREATE_WORKERS,
    UPDATE_USERS,
    ACTIVATE_DEACTIVATE_USERS,
    DELETE_USERS,          // Удаление пользователей
    
    // Аналитика
    VIEW_ANALYTICS,
    VIEW_BI_DASHBOARD,
    VIEW_ACTIVITY_LOG,
    EXPORT_REPORTS,        // Экспорт отчётов

    // Карта зала
    VIEW_HALL_MAP,
    MANAGE_HALL_MAP,
    MANAGE_HALL_ZONES,     // Управление зонами зала
    MANAGE_HALL_TABLES     // Управление столами
}

