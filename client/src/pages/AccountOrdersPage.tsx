import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AccountLayout from "../components/account/AccountLayout";
import AccountCard from "../components/account/AccountCard";
import AccountRequestCard from "../components/account/AccountRequestCard";
import { getCustomerRequests, type CustomerRequest } from "../data/customer-account";
import { useCustomerAccount } from "../context/useCustomerAccount";

export default function AccountOrdersPage() {
  const navigate = useNavigate();
  const { customer, loading } = useCustomerAccount();
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!customer) {
      navigate("/account/login", { replace: true });
      return;
    }
    Promise.resolve().then(async () => {
      setBusy(true);
      try {
        setRequests(await getCustomerRequests());
      } finally {
        setBusy(false);
      }
    });
  }, [customer, loading, navigate]);

  return (
    <AccountLayout title="Мої заявки" subtitle="Список заявок, статус виконання, погоджена вартість і стан розрахунку.">
      <Link to="/account" className="mb-4 inline-flex text-sm font-bold text-dark hover:text-primary">
        ← До кабінету
      </Link>
      <div className="flex flex-col gap-4">
        {busy ? (
          <AccountCard><p className="text-sm font-medium text-dark-text">Завантаження заявок...</p></AccountCard>
        ) : requests.length === 0 ? (
          <AccountCard><p className="text-sm font-medium text-dark-text">Заявок поки немає.</p></AccountCard>
        ) : (
          requests.map((request) => (
            <AccountRequestCard
              key={request.id}
              request={request}
              backTo="/account/orders"
              backLabel="До всіх заявок"
            />
          ))
        )}
      </div>
    </AccountLayout>
  );
}
