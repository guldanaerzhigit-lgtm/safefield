-- SAFEFIELD интерфейсінің негізгі тілі — қазақ тілі.
UPDATE users SET locale='kk' WHERE locale<>'kk';
UPDATE roles SET name=CASE code
  WHEN 'EMPLOYEE' THEN 'Қызметкер'
  WHEN 'SUPERVISOR' THEN 'Топ жетекшісі'
  WHEN 'DISPATCHER' THEN 'Диспетчер'
  WHEN 'SAFETY_MANAGER' THEN 'Қауіпсіздік менеджері'
  WHEN 'ADMIN' THEN 'Әкімші'
  ELSE name END;
UPDATE safety_activity_types SET name=CASE code
  WHEN 'INSTALLATION' THEN 'Монтаж жұмыстары'
  WHEN 'MAINTENANCE' THEN 'Техникалық қызмет көрсету'
  WHEN 'WORK_AT_HEIGHT' THEN 'Биіктіктегі жұмыс'
  WHEN 'ELECTRICAL' THEN 'Электр-техникалық жұмыстар'
  WHEN 'EMERGENCY_REPAIR' THEN 'Апаттық-қалпына келтіру жұмыстары'
  WHEN 'OTHER' THEN 'Басқа'
  ELSE name END;
