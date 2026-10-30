import {requireChatGPTUser} from '../chatgpt-auth';
import {AccountDashboard} from '../../components/account-dashboard';
export const dynamic='force-dynamic';
export default async function AccountPage(){const user=await requireChatGPTUser('/account');return <AccountDashboard displayName={user.displayName}/>;}
